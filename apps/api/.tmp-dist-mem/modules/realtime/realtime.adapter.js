import { IoAdapter } from '@nestjs/platform-socket.io';
/** Socket.IO com CORS igual ao da API (`CORS_ORIGINS`); sem origens, nenhuma origem de navegador (o app nativo não manda `Origin`). */
export class RealtimeAdapter extends IoAdapter {
    origins;
    constructor(app, origins) {
        super(app);
        this.origins = origins;
    }
    createIOServer(port, options) {
        // `options` do Nest chega sem `path` quando o gateway não define; o Socket.IO usa o padrão (/socket.io).
        return super.createIOServer(port, { ...options, cors: { origin: this.origins.length > 0 ? this.origins : false }, maxHttpBufferSize: 10_000 });
    }
}
//# sourceMappingURL=realtime.adapter.js.map