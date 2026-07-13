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
  "inboundProtocol": "both",
  "records": [
    {
      "pattern": "{1-254}.vm.test",
      "ip": "192.168.100.$1"
    }
  ]
}
```

- `inboundProtocol`: Set to `"udp"`, `"doh"`, or `"both"` (default: `"both"`).

## Running

```bash
docker compose up -d --build
```

- UDP queries are exposed on port `8053/udp` (internal port `5353`).
- DoH HTTP queries are exposed on port `8080/tcp` (internal port `80`) at path `/dns-query`. Supports both `POST` (binary payload) and `GET` (base64url `?dns=` query string).

## Development

```bash
npm install
npm run build
npm start
```
