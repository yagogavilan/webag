import 'server-only';
import { NextResponse } from 'next/server';

export function problem(status: number, code: string, title: string, detail?: string): NextResponse {
  return NextResponse.json({ type: 'about:blank', title, status, code, ...(detail ? { detail } : {}) }, { status, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } });
}
