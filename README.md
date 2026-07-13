# Dyn

Simple dynamic DNS server in TypeScript running on Node.js/Docker with fallback DoH (DNS-over-HTTPS) resolution.

## Features

- Matches domain patterns like `{1-254}.vm.test` to target IPs like `192.168.100.{1-254}`.
- Proxies unmatched queries to an upstream DoH provider (Cloudflare by default).

## Configuration (`config.json`)

```json
{
  "upstreamDoH": "https://cloudflare-dns.com/dns-query",
  "enableUpstream": true,
  "records": [
    {
      "pattern": "{1-254}.vm.test",
      "ip": "192.168.100.$1"
    }
  ]
}
```

## Running

```bash
docker compose up -d --build
```

Queries are exposed on port `8053/udp`.

## Development

```bash
npm install
npm run build
npm start
```
