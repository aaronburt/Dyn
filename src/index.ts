import dgram from 'dgram';
import http from 'http';
import fs from 'fs';
import dnsPacket from 'dns-packet';
import { z } from 'zod';

const PORT = parseInt(process.env.PORT || '5353', 10);
const DOH_PORT = parseInt(process.env.DOH_PORT || '80', 10);
const CONFIG_PATH = './config.json';

const ConfigSchema = z.object({
  upstreamDoH: z.string().default('https://cloudflare-dns.com/dns-query'),
  enableUpstream: z.boolean().default(true),
  inboundProtocol: z.enum(['udp', 'doh', 'both']).default('both'),
  records: z.array(z.object({
    pattern: z.string(),
    ip: z.string()
  }))
});

const configRaw: unknown = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const config = ConfigSchema.parse(configRaw);

const parsedRecords = config.records.map(record => {
  const rangeMatch = record.pattern.match(/\{(\d+)-(\d+)\}/);
  const min = rangeMatch ? parseInt(rangeMatch[1], 10) : 0;
  const max = rangeMatch ? parseInt(rangeMatch[2], 10) : Infinity;
  const regexStr = record.pattern
    .replace(/\{(\d+)-(\d+)\}/, '___VAR___')
    .replace(/\./g, '\\.')
    .replace('___VAR___', '(\\d+)');

  return {
    ...record,
    regex: new RegExp(`^${regexStr}$`, 'i'),
    min,
    max,
  };
});

export function resolveQuery(questionName: string): string | null {
  for (const record of parsedRecords) {
    const match = questionName.match(record.regex);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val >= record.min && val <= record.max) {
        return record.ip.replace('$1', val.toString());
      }
    }
  }
  return null;
}

async function resolveUpstream(msg: Buffer, url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/dns-message',
        'Accept': 'application/dns-message'
      },
      body: new Uint8Array(msg),
      signal: controller.signal
    });
    
    if (!res.ok) throw new Error(`Upstream error: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function handleDnsMessage(msg: Buffer): Promise<Buffer | null> {
  const packet = dnsPacket.decode(msg);
  if (!packet.questions || packet.questions.length === 0) return null;

  const question = packet.questions[0];
  const ip = resolveQuery(question.name);

  if (ip) {
    return dnsPacket.encode({
      type: 'response',
      id: packet.id,
      flags: dnsPacket.AUTHORITATIVE_ANSWER,
      questions: packet.questions,
      answers: [{
        type: 'A',
        class: 'IN',
        name: question.name,
        ttl: 60,
        data: ip
      }]
    });
  }

  if (config.enableUpstream) {
    return await resolveUpstream(msg, config.upstreamDoH);
  }

  return null;
}

export function startUDPServer(port: number) {
  const server = dgram.createSocket('udp4');

  server.on('message', async (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    try {
      const response = await handleDnsMessage(msg);
      if (response) {
        server.send(response, 0, response.length, rinfo.port, rinfo.address);
      }
    } catch (err) {
      console.error('Error handling UDP query:', err);
    }
  });

  server.on('listening', () => {
    console.log(`UDP DNS server listening on port ${port}...`);
  });

  server.bind(port);
  return server;
}

export function startDoHServer(port: number) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== '/dns-query') {
      res.writeHead(404);
      res.end();
      return;
    }

    try {
      let dnsBuffer: Buffer | null = null;

      if (req.method === 'POST') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.from(chunk));
        }
        dnsBuffer = Buffer.concat(chunks);
      } else if (req.method === 'GET') {
        const dnsParam = url.searchParams.get('dns');
        if (dnsParam) {
          const base64 = dnsParam.replace(/-/g, '+').replace(/_/g, '/');
          dnsBuffer = Buffer.from(base64, 'base64');
        }
      }

      if (!dnsBuffer || dnsBuffer.length === 0) {
        res.writeHead(400);
        res.end();
        return;
      }

      const response = await handleDnsMessage(dnsBuffer);
      if (response) {
        res.writeHead(200, { 'Content-Type': 'application/dns-message' });
        res.end(response);
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch (err) {
      console.error('Error handling DoH query:', err);
      res.writeHead(500);
      res.end();
    }
  });

  server.listen(port, () => {
    console.log(`DoH HTTP server listening on port ${port}...`);
  });

  return server;
}

if (process.env.NODE_ENV !== 'test') {
  if (config.inboundProtocol === 'udp' || config.inboundProtocol === 'both') {
    startUDPServer(PORT);
  }
  if (config.inboundProtocol === 'doh' || config.inboundProtocol === 'both') {
    startDoHServer(DOH_PORT);
  }
}
