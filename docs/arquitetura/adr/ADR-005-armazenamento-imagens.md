# ADR-005: Armazenamento de arquivos e imagens

- **Status:** Aceita
- **Data:** 2026-11-18
- **Autor:** tech-lead
- **Revisores:** backend-dev, mobile-dev, security-engineer (documentos de lojista e fotos de troca são dado pessoal)

Legenda de fontes: ver ADR-001.

## Contexto
Fotos de produto, logo e capa de loja, banners (públicos); documentos do lojista e fotos de troca (privados, dado pessoal). Brief: S3-compatível com MinIO local e redimensionamento; upload com recorte e compressão; imagens progressivas com cache; celular fraco e 3G.

**Fato novo:** a imagem `minio/minio` não existe mais no Docker Hub (`pull access denied ... repository does not exist`) e `quay.io/minio/minio` não respondeu nesta sessão [V 2026-11-18]. A MinIO encerrou a distribuição de binários/imagens da edição comunitária `[N — conferir anúncio no repositório minio/minio]`. Manter "MinIO local" exigiria compilar da fonte.

## Opções consideradas
### Servidor S3 local (dev)
| Opção | Prós | Contras |
|---|---|---|
| **RustFS 1.0.6** [V] | Apache-2.0; release estável; amd64+arm64; mesmas portas e variáveis do MinIO (aceita `MINIO_ROOT_USER`); console web | Projeto mais jovem |
| SeaweedFS 4.54 [V] | Apache-2.0, maduro | Configuração de S3/credenciais mais trabalhosa |
| Garage 2.1 [V] | Leve | AGPL; exige configurar layout de cluster antes de usar |
| VersityGW 1.11 [V] | Apache-2.0, simples | Sem console; foco em gateway POSIX |
| MinIO compilado da fonte | Nome do brief | Build próprio, sem imagem oficial |

### Processamento de imagem
| Opção | Prós | Contras |
|---|---|---|
| **Variantes pré-geradas com `sharp` em job BullMQ** | Sem serviço extra; URL estável e cacheável no CDN | Mudar tamanhos exige reprocessar |
| imgproxy / thumbor sob demanda | Flexível | Mais um serviço e CPU no VPS |
| Cloudinary / ImageKit | Pronto | Custo e lock-in |

## Decisão
1. **API S3 apenas** (AWS SDK v3, `forcePathStyle`), configurada por env. Local: **RustFS** no `docker-compose.yml`. Produção: decisão do fundador entre Cloudflare R2 (recomendado: egress gratuito `[N]`), AWS S3, Backblaze B2 ou RustFS no próprio VPS (custo zero, backup por nossa conta). Trocar é só `.env`.
2. **Dois buckets:** `webag-public` (leitura pública via CDN, chaves imutáveis) e `webag-private` (só URL pré-assinada de leitura com 5 min).
3. **Upload direto do cliente** com **POST pré-assinado** (permite `content-length-range` e `Content-Type` fixos; PUT pré-assinado não limita tamanho). Fluxo: `POST /v1/uploads` (finalidade + tipo) → policy → cliente envia ao S3 → `POST /v1/uploads/{id}/complete` → job processa.
4. **Cliente comprime antes:** mobile com `expo-image-manipulator` (lado maior 2048 px, JPEG 0,8; converte HEIC do iPhone); web com recorte em canvas. Servidor aceita só JPEG/PNG/WebP até 10 MB, valida pelos *magic bytes*, não pela extensão.
5. **Job `sharp`:** remove metadados (EXIF/GPS — privacidade), gera WebP 160/400/800/1600 px, calcula `thumbhash` para placeholder progressivo (`expo-image` e web), grava em `media_assets` (dono, finalidade, variantes, dimensões). Original fica no bucket privado.
6. **Chaves:** `products/{productId}/{assetId}/{w}.webp`; privados em `stores/{storeId}/documents/...` e `exchanges/{exchangeId}/...`.
7. **Retenção (LGPD):** fotos de troca apagadas 180 dias após o encerramento; documentos do lojista enquanto a loja existir + prazo legal `[HIPÓTESE — security/jurídico confirmam]`.

## Consequências
- Positivas: API não trafega bytes de upload; imagens leves e cacheáveis para 3G; troca de provedor só por env.
- Negativas / dívida: desvio do brief (RustFS no lugar de MinIO) — comportamento idêntico para o código; sem antivírus em PDF de documento na 1.0 (DT-005, security decide).
- Reavaliar se: catálogo passar de centenas de milhares de imagens (custo de reprocessar) ou se for preciso recorte dinâmico por tela.

## Fontes
- [V] Docker Hub 2026-11-18: `minio/minio` indisponível; `rustfs/rustfs` 1.0.6 (label `license=Apache-2.0`, amd64/arm64, entrypoint com `RUSTFS_ACCESS_KEY`/`RUSTFS_SECRET_KEY` e fallback `MINIO_ROOT_USER`); `chrislusf/seaweedfs` 4.54; `dxflrs/garage` v2.1.0; `versity/versitygw` v1.11.0.
- [V] npm: `sharp` 0.35.5, `@aws-sdk/client-s3` / `@aws-sdk/s3-presigned-post` 3.1171.0, `expo-image-manipulator` 58.0.16, `thumbhash` 0.1.1.
- [N] https://github.com/minio/minio (aviso de distribuição) ; https://github.com/rustfs/rustfs ; https://sharp.pixelplumbing.com/api-output#keepmetadata ; https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-HTTPPOSTConstructPolicy.html ; https://developers.cloudflare.com/r2/pricing/ ; https://docs.expo.dev/versions/latest/sdk/image/
