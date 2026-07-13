import dgram from 'dgram';
import fs from 'fs';
import dnsPacket from 'dns-packet';
import { z } from 'zod';

const PORT = parseInt(process.env.PORT || '5353', 10);
const CONFIG_PATH = './config.json';

const ConfigSchema = z.object({
  upstreamDoH: z.string().default('https://cloudflare-dns.com/dns-query'),
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
    rangeStr: rangeMatch ? rangeMatch[0] : '',
  };
});

export function resolveQuery(questionName: string): string | null {
  for (const record of parsedRecords) {
    const match = questionName.match(record.regex);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val >= record.min && val <= record.max) {
        return record.ip.replace(record.rangeStr, val.toString());
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

const server = dgram.createSocket('udp4');

server.on('message', async (msg: Buffer, rinfo: dgram.RemoteInfo) => {
  try {
    const packet = dnsPacket.decode(msg);
    if (!packet.questions || packet.questions.length === 0) return;

    const question = packet.questions[0];
    const ip = resolveQuery(question.name);
    
    if (ip) {
      const response = dnsPacket.encode({
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
      
      server.send(response, 0, response.length, rinfo.port, rinfo.address);
    } else {
      const responseBuf = await resolveUpstream(msg, config.upstreamDoH);
      server.send(responseBuf, 0, responseBuf.length, rinfo.port, rinfo.address);
    }
  } catch (err) {
  }
});

server.bind(PORT);
