import { createHmac, randomBytes } from 'node:crypto';
/**
 * Driver em memória: SÓ testes (o boot de produção o recusa). Imita o que importa para a segurança: a policy do POST
 * pré-assinado (tamanho e tipo fixos) e a URL de leitura com expiração.
 */
export class MemoryObjectStorage {
    objects = new Map();
    secret = randomBytes(16).toString('hex');
    /** Policies emitidas: `upload()` as aplica como o S3 aplicaria. */
    policies = new Map();
    k(bucket, key) {
        return `${bucket}:${key}`;
    }
    presignedPost(bucket, key, options) {
        const expiresAt = Date.now() + options.expiresSeconds * 1000;
        this.policies.set(this.k(bucket, key), { maxBytes: options.maxBytes, contentType: options.contentType, expiresAt });
        return Promise.resolve({ url: 'memory://upload', fields: { key, 'Content-Type': options.contentType }, expiresAt: new Date(expiresAt) });
    }
    /** Simula o cliente enviando ao S3 com a policy emitida. Devolve o status HTTP que o S3 devolveria. */
    upload(bucket, key, body, contentType) {
        const policy = this.policies.get(this.k(bucket, key));
        if (!policy || policy.expiresAt < Date.now())
            return 403;
        if (body.length < 1 || body.length > policy.maxBytes || contentType !== policy.contentType)
            return 400;
        this.objects.set(this.k(bucket, key), { body, contentType });
        return 204;
    }
    getObject(bucket, key, options) {
        const found = this.objects.get(this.k(bucket, key));
        return Promise.resolve(found ? found.body.subarray(0, options.maxBytes + 1) : null);
    }
    putObject(bucket, key, body, contentType) {
        this.objects.set(this.k(bucket, key), { body, contentType });
        return Promise.resolve();
    }
    deleteObject(bucket, key) {
        this.objects.delete(this.k(bucket, key));
        return Promise.resolve();
    }
    presignedGetUrl(bucket, key, options) {
        const exp = Date.now() + options.expiresSeconds * 1000;
        const sig = createHmac('sha256', this.secret).update(`${bucket}:${key}:${exp}`).digest('hex').slice(0, 16);
        return Promise.resolve(`memory://${bucket}/${key}?exp=${exp}&ct=${encodeURIComponent(options.contentType)}&sig=${sig}`);
    }
    /** Simula o GET da URL assinada no instante `at`: 200 com URL válida; 403 sem assinatura, adulterada ou vencida. */
    fetchSigned(url, at = Date.now()) {
        const match = url ? /^memory:\/\/(public|private)\/(.+)\?exp=(\d+)&ct=([^&]+)&sig=([0-9a-f]+)$/.exec(url) : null;
        if (!match)
            return { status: 403 };
        const [, bucket, key, exp, ct, sig] = match;
        const expected = createHmac('sha256', this.secret).update(`${bucket}:${key}:${exp}`).digest('hex').slice(0, 16);
        if (sig !== expected || Number(exp) < at)
            return { status: 403 };
        const found = this.objects.get(this.k(bucket, key));
        return found ? { status: 200, body: found.body, contentType: decodeURIComponent(ct) } : { status: 403 };
    }
    /** GET anônimo direto no bucket privado, sem URL assinada: sempre 403 (SEC-051). */
    fetchAnonymous(bucket, key) {
        return bucket === 'public' && this.objects.has(this.k(bucket, key)) ? { status: 200 } : { status: 403 };
    }
    publicUrl(key) {
        return `memory://public/${key}`;
    }
    has(bucket, key) {
        return this.objects.has(this.k(bucket, key));
    }
    keys(bucket) {
        return [...this.objects.keys()].filter((k) => k.startsWith(`${bucket}:`)).map((k) => k.slice(bucket.length + 1));
    }
}
//# sourceMappingURL=memory.storage.js.map