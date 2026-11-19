import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/** Socket.IO com CORS igual ao da API (`CORS_ORIGINS`); sem origens, nenhuma origem de navegador (o app nativo não manda `Origin`). */
export class RealtimeAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    // `options` do Nest chega sem `path` quando o gateway não define; o Socket.IO usa o padrão (/socket.io).
    return super.createIOServer(port, { ...options, cors: { origin: this.origins.length > 0 ? this.origins : false }, maxHttpBufferSize: 10_000 } as ServerOptions);
  }
}
