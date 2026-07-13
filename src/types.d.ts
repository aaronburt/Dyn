declare module 'dns-packet' {
  export const AUTHORITATIVE_ANSWER: number;

  export interface Question {
    type: string;
    class: string;
    name: string;
  }

  export interface Answer {
    type: string;
    class: string;
    name: string;
    ttl: number;
    data: string;
  }

  export interface Packet {
    type?: 'query' | 'response';
    id?: number;
    flags?: number;
    questions?: Question[];
    answers?: Answer[];
  }

  export function decode(buf: Buffer): Packet;
  export function encode(packet: Packet): Buffer;
}
