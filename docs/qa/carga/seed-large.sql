-- seed-large: volume realista para medir desempenho (docs/qa/performance/api-2026-11-22.md).
-- Pré-requisito: banco migrado e com o seed padrão (`pnpm db:migrate && pnpm db:seed`): usa categorias, cidades, parâmetros e a tabela de frete dele.
-- Uso:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/qa/carga/seed-large.sql
-- NUNCA em produção. Tudo que ele cria usa o domínio `@perf.webag.local` (e-mail) para ser identificável e removível.
-- Volume (parâmetros no topo): 188 lojas novas (total ~200), 20.000 produtos, ~34.000 variações, 10.000 clientes, 100.000 pedidos,
-- ~200.000 itens de pedido, ~300.000 eventos de pedido e 40.000 avaliações. Senha de todos os clientes = a do cliente do seed padrão
-- (`webag-seed-lojista-2026`), porque o hash é copiado dele.
\set ON_ERROR_STOP on
\timing on
set synchronous_commit = off;
set work_mem = '128MB';
set maintenance_work_mem = '512MB';

\set n_stores 188
\set n_products 20000
\set n_customers 10000
\set n_orders 100000

begin;

-- Cidades-alvo (centro aproximado) para espalhar lojas e clientes na região.
create temp table tmp_city as
select c.id as city_id, c.name as city_name, v.lat, v.lng, v.w
  from cities c
  join (values ('Francisco Morato', -23.2808, -46.7442, 50), ('Franco da Rocha', -23.3220, -46.7270, 25), ('Caieiras', -23.3640, -46.7400, 15), ('Campo Limpo Paulista', -23.2080, -46.7880, 10)) as v(name, lat, lng, w)
    on v.name = c.name;

create temp table tmp_cat as select id, row_number() over (order by id) as rn from categories where active and parent_id is not null;
create temp table tmp_topcat as select id, row_number() over (order by id) as rn from categories where active and parent_id is null;

-- Palavras para nomes de produto/loja (com acento de propósito: exercita f_norm e a busca por trigrama).
create temp table tmp_words as select * from (values
  (1, 'Arroz'), (2, 'Feijão'), (3, 'Camiseta'), (4, 'Tênis'), (5, 'Ração'), (6, 'Shampoo'), (7, 'Caderno'), (8, 'Fone'), (9, 'Carregador'), (10, 'Café'),
  (11, 'Leite'), (12, 'Pão'), (13, 'Maçã'), (14, 'Banana'), (15, 'Sabonete'), (16, 'Detergente'), (17, 'Lápis'), (18, 'Mochila'), (19, 'Bermuda'), (20, 'Vestido'),
  (21, 'Coleira'), (22, 'Brinquedo'), (23, 'Parafuso'), (24, 'Lâmpada'), (25, 'Cabo'), (26, 'Biscoito'), (27, 'Refrigerante'), (28, 'Suco'), (29, 'Queijo'), (30, 'Presunto'),
  (31, 'Frango'), (32, 'Carne'), (33, 'Tomate'), (34, 'Cebola'), (35, 'Batata'), (36, 'Chinelo'), (37, 'Boné'), (38, 'Relógio'), (39, 'Panela'), (40, 'Vitamina')) as t(n, w);
create temp table tmp_adj as select * from (values
  (1, 'tradicional'), (2, 'premium'), (3, 'integral'), (4, 'econômico'), (5, 'infantil'), (6, 'sem açúcar'), (7, 'grande'), (8, 'pequeno'), (9, 'azul'), (10, 'preto')) as t(n, a);

-- 1) Donos das lojas novas e clientes (users). Hash de senha copiado do cliente do seed padrão.
create temp table tmp_pw as select password_hash from users where email = 'cliente.bruno@seed.webag.local';

insert into users (id, email, email_verified_at, password_hash, name, status, adult_declared_at, created_at, updated_at)
select gen_random_uuid(), 'dono' || i || '@perf.webag.local', now(), (select password_hash from tmp_pw), 'Dono da loja ' || i, 'active', now(), now() - (random() * interval '200 days'), now()
  from generate_series(1, :n_stores) i;

insert into users (id, email, email_verified_at, password_hash, name, status, adult_declared_at, created_at, updated_at)
select gen_random_uuid(), 'cliente' || i || '@perf.webag.local', now(), (select password_hash from tmp_pw),
       (array['Ana','Bruno','Carla','Diego','Elisa','Fábio','Gabriela','Hugo','Isabela','João'])[1 + (i % 10)] || ' ' || (array['Silva','Souza','Oliveira','Santos','Lima','Pereira','Costa','Ribeiro'])[1 + (i % 8)],
       'active', now(), now() - (random() * interval '300 days'), now()
  from generate_series(1, :n_customers) i;

insert into user_roles (user_id, role) select id, 'merchant' from users where email ~ '^dono[0-9]+@perf\.webag\.local$';
insert into user_roles (user_id, role) select id, 'customer' from users where email ~ '^cliente[0-9]+@perf\.webag\.local$';

-- 2) Lojas.
create temp table tmp_store as
select gen_random_uuid() as id, u.id as owner_id, row_number() over (order by u.email) as i
  from users u where u.email ~ '^dono[0-9]+@perf\.webag\.local$';

insert into stores (id, owner_user_id, status, document_type, document_number, legal_name, name, main_category_id, description, phone, address_cep, address_street, address_number,
                    address_neighborhood, address_city_id, address_city_name, address_state, lat, lng, approved_at, submitted_at, decided_at, created_at, updated_at)
select s.id, s.owner_id, 'approved', 'cnpj', '99' || lpad(s.i::text, 12, '0'), 'Loja ' || s.i || ' LTDA',
       (select w from tmp_words where n = 1 + (s.i % 40)) || ' & ' || (select w from tmp_words where n = 1 + ((s.i * 7) % 40)) || ' ' || s.i,
       (select id from tmp_topcat where rn = 1 + (s.i % (select count(*) from tmp_topcat))),
       'Loja de teste de carga número ' || s.i, '11999990000', '07900100', 'Rua de Carga', s.i::text, 'Centro', c.city_id, c.city_name, 'SP',
       round((c.lat + (random() - 0.5) * 0.09)::numeric, 6), round((c.lng + (random() - 0.5) * 0.09)::numeric, 6),
       case when s.i % 7 = 0 then now() - (random() * interval '25 days') else now() - interval '60 days' - (random() * interval '200 days') end,
       now() - interval '300 days', now() - interval '290 days', now() - interval '300 days', now()
  from tmp_store s
  join lateral (select * from (select *, sum(w) over (order by city_name) as cum from tmp_city) x where x.cum > (s.i * 37) % 100 order by x.cum limit 1) c on true;

insert into store_settings (store_id, accepts_delivery, radius_m, pickup_enabled, voluntary_exchange_days, eta_min_minutes, eta_max_minutes, prep_minutes, updated_at)
select s.id, true, 10000, (s.i % 3 = 0), case when s.i % 4 = 0 then 7 else 0 end, 30, 60, 10 + (s.i % 25), now() from tmp_store s;

insert into store_hours (store_id, weekday, start_min, end_min) select s.id, d, 0, 1439 from tmp_store s, generate_series(0, 6) d;

insert into payment_accounts (store_id, provider, provider_account_id, status, holder_document_masked, holder_matches_store, tokens_enc, connected_by)
select s.id, 'mercadopago', 'perf-acc-' || s.i, 'active', '99.***.***/****-**', true, 'perf-not-a-token', s.owner_id from tmp_store s;

insert into store_members (store_id, user_id, role) select s.id, s.owner_id, 'owner' from tmp_store s;

insert into store_extra_categories (store_id, category_id)
select s.id, (select id from tmp_cat where rn = 1 + ((s.i * 3) % (select count(*) from tmp_cat))) from tmp_store s;

-- 3) Produtos (20 mil), variações e imagens (cada produto com 1 imagem, 4 larguras como o pipeline real: 160/400/800/1600).
create temp table tmp_prod as
select gen_random_uuid() as id, gen_random_uuid() as asset_id, i,
       (select id from tmp_store where i = 1 + (g.i % (select count(*) from tmp_store))) as store_id
  from generate_series(1, :n_products) g(i);

alter table tmp_prod add column owner_id uuid;
update tmp_prod p set owner_id = s.owner_id from tmp_store s where s.id = p.store_id;

insert into media_assets (id, owner_user_id, store_id, purpose, status, object_key, declared_content_type, declared_size_bytes, content_type, size_bytes, width, height, variants, created_at, completed_at, expires_at)
select p.asset_id, p.owner_id, p.store_id, 'product_image', 'ready', 'uploads/' || p.store_id || '/' || p.asset_id, 'image/jpeg', 300000, 'image/jpeg', 300000, 1600, 1600,
       jsonb_build_object('160', 'media/' || p.asset_id || '/160.webp', '400', 'media/' || p.asset_id || '/400.webp', '800', 'media/' || p.asset_id || '/800.webp', '1600', 'media/' || p.asset_id || '/1600.webp'),
       now(), now(), now() + interval '1 day'
  from tmp_prod p;

insert into products (id, store_id, name, description, category_id, position, status, moderation_status, base_price_cents, promo_price_cents, promo_starts_at, promo_ends_at, published_at, created_at, updated_at)
select p.id, p.store_id,
       (select w from tmp_words where n = 1 + (p.i % 40)) || ' ' || (select a from tmp_adj where n = 1 + ((p.i / 40)::int % 10)) || ' ' || p.i,
       'Descrição do produto de teste de carga ' || p.i || '. ' || repeat('Texto de enchimento realista para o tamanho da linha. ', 6),
       (select id from tmp_cat where rn = 1 + (p.i % (select count(*) from tmp_cat))), p.i % 50, 'active', 'ok',
       300 + (p.i * 37 % 29000),
       case when p.i % 6 = 0 then 200 + (p.i * 37 % 29000) * 8 / 10 else null end,
       case when p.i % 6 = 0 then now() - interval '2 days' else null end,
       case when p.i % 6 = 0 then now() + interval '20 days' else null end,
       now() - interval '30 days', now() - interval '60 days', now()
  from tmp_prod p;
-- a promoção precisa ser menor que o preço base (check products_promo_chk)
update products set promo_price_cents = greatest(1, base_price_cents * 8 / 10) where promo_price_cents is not null;

insert into product_images (product_id, asset_id, position) select p.id, p.asset_id, 0 from tmp_prod p;

-- Variações: 1 (padrão) ou 2 (P e M, 1/3 dos produtos) por produto; ~3% com estoque 0 (sem estoque aparece só na loja).
insert into product_variants (product_id, store_id, attributes, attributes_key, price_cents, stock, reserved, active)
select p.id, p.store_id, case when v = 0 then '{}'::jsonb else jsonb_build_object('Tamanho', (array['P','M','G'])[v]) end, case when v = 0 then '' else 'tamanho=' || (array['P','M','G'])[v] end,
       null, case when (p.i + v) % 33 = 0 then 0 else 5 + ((p.i * 13 + v) % 400) end, 0, true
  from tmp_prod p
  join lateral generate_series(0, case when p.i % 3 = 0 then 2 else 0 end) v on true
 where not (p.i % 3 = 0 and v = 0);

-- 4) Endereços dos clientes (todos padrão) espalhados nas 4 cidades.
insert into user_addresses (user_id, label, cep, street, number, neighborhood, city_name, state, city_id, lat, lng, is_default, pin_verified)
select u.id, 'home', '07900100', 'Rua do Cliente', (1 + (n % 900))::text, 'Centro', c.city_name, 'SP', c.city_id,
       round((c.lat + (random() - 0.5) * 0.10)::numeric, 6), round((c.lng + (random() - 0.5) * 0.10)::numeric, 6), true, false
  from (select id, row_number() over (order by email) as n from users where email ~ '^cliente[0-9]+@perf\.webag\.local$') u
  join lateral (select * from (select *, sum(w) over (order by city_name) as cum from tmp_city) x where x.cum > (u.n * 53) % 100 order by x.cum limit 1) c on true;

-- 5) Pedidos históricos (100 mil), itens e eventos. Lojas com distribuição enviesada (poucas lojas vendem muito).
create temp table tmp_cust as select id, row_number() over (order by email) as rn from users where email ~ '^cliente[0-9]+@perf\.webag\.local$';
create temp table tmp_pp as select p.id, p.store_id, p.i, row_number() over (partition by p.store_id order by p.i) as rn, count(*) over (partition by p.store_id) as cnt from tmp_prod p;
create index on tmp_pp (store_id, rn);
create temp table tmp_vv as select distinct on (product_id) id, product_id from product_variants where product_id in (select id from tmp_prod) order by product_id, created_at;
create index on tmp_vv (product_id);
create temp table tmp_storeord as select id, row_number() over (order by i) as rn, count(*) over () as cnt from tmp_store;
create index on tmp_cust (rn);
create index on tmp_storeord (rn);
analyze tmp_cust; analyze tmp_storeord; analyze tmp_pp; analyze tmp_vv;

create temp table tmp_o as
select gen_random_uuid() as id, g.i,
       (select id from tmp_cust where rn = 1 + (abs(hashint8(g.i)) % :n_customers)) as user_id,
       (select id from tmp_storeord where rn = 1 + floor(power((abs(hashint8(g.i * 3 + 1)) % 1000000) / 1000000.0, 2) * (select max(cnt) from tmp_storeord))::int) as store_id,
       now() - (random() * interval '90 days') as created_at,
       case when g.i % 50 = 0 then (array['awaiting_payment','received','accepted','in_preparation','out_for_delivery'])[1 + (g.i / 50 % 5)]
            when g.i % 12 = 0 then 'cancelled' when g.i % 40 = 1 then 'refused' else 'delivered' end as status,
       1 + (g.i % 3) as n_items
  from generate_series(1, :n_orders) g(i);
-- pedidos recentes para os que ainda estão em andamento
update tmp_o set created_at = now() - (random() * interval '40 minutes') where status in ('awaiting_payment','received','accepted','in_preparation','out_for_delivery');

create temp table tmp_i as
select o.id as order_id, o.i, k, pp.id as product_id, v.id as variant_id, 1 + ((o.i + k) % 3) as qty, pr.base_price_cents as price, pr.category_id, pr.name
  from tmp_o o
  join lateral generate_series(1, o.n_items) k on true
  join lateral (select id, cnt, rn from tmp_pp where store_id = o.store_id and rn = 1 + ((o.i * 7 + k * 13) % (select max(cnt) from tmp_pp where store_id = o.store_id)) limit 1) pp on true
  join tmp_vv v on v.product_id = pp.id
  join products pr on pr.id = pp.id;

create temp table tmp_sum as select order_id, sum(qty * price)::int as subtotal from tmp_i group by 1;

insert into orders (id, number, user_id, store_id, status, mode, cart_revision, address, eta_min_minutes, eta_max_minutes, subtotal_cents, delivery_fee_cents, service_fee_cents, discount_cents,
                    total_cents, commission_cents, application_fee_cents, finance, payment_method, stock_state, paid_at, accepted_at, delivered_at, cancelled_at, cancelled_by, created_at, updated_at, delivery_snapshot)
select o.id, 'LD' || to_char(o.i, 'FM000000'), o.user_id, o.store_id, o.status, 'delivery', 0,
       (select jsonb_build_object('cep', a.cep, 'city', a.city_name, 'state', 'SP', 'cityId', a.city_id, 'number', a.number, 'street', a.street, 'complement', null, 'neighborhood', 'Centro', 'neighborhoodId', null) from user_addresses a where a.user_id = o.user_id limit 1),
       30, 50, s.subtotal, 600, 0, 0, s.subtotal + 600, s.subtotal * 15 / 100, s.subtotal * 15 / 100 + 600,
       jsonb_build_object('subtotalCents', s.subtotal, 'totalCents', s.subtotal + 600, 'commissionCents', s.subtotal * 15 / 100),
       'pix', case when o.status = 'delivered' then 'sold' when o.status in ('cancelled','refused') then 'released' else 'reserved' end,
       case when o.status <> 'awaiting_payment' and o.status not in ('cancelled','refused') then o.created_at + interval '2 minutes' end,
       case when o.status in ('accepted','in_preparation','out_for_delivery','delivered') then o.created_at + interval '5 minutes' end,
       case when o.status = 'delivered' then o.created_at + interval '55 minutes' end,
       case when o.status in ('cancelled','refused') then o.created_at + interval '10 minutes' end,
       case when o.status = 'cancelled' then 'customer' end,
       o.created_at, o.created_at + interval '1 hour', jsonb_build_object('exchangeFeeCents', 300, 'expectedCostCents', 800)
  from tmp_o o join tmp_sum s on s.order_id = o.id;

insert into order_items (order_id, product_id, variant_id, category_id, name, attributes, image, quantity, unit_price_cents, line_total_cents, commission_pct_bp, stock_state, created_at)
select i.order_id, i.product_id, i.variant_id, i.category_id, i.name, '{}'::jsonb, '{}'::jsonb, i.qty, i.price, i.qty * i.price, 1500,
       case when o.status = 'delivered' then 'sold' else 'reserved' end, o.created_at
  from tmp_i i join tmp_o o on o.id = i.order_id;

insert into order_events (order_id, from_status, to_status, actor, reason, at)
select o.id, null, 'awaiting_payment', 'customer', null, o.created_at from tmp_o o
union all select o.id, 'awaiting_payment', 'received', 'system', null, o.created_at + interval '2 minutes' from tmp_o o where o.status not in ('awaiting_payment')
union all select o.id, 'received', o.status, 'merchant', null, o.created_at + interval '30 minutes' from tmp_o o where o.status in ('delivered','cancelled','refused','accepted','in_preparation','out_for_delivery');

-- 6) Avaliações: 30 mil de loja (ligadas a pedidos entregues) e 10 mil de produto.
insert into reviews (store_id, product_id, user_id, order_id, rating, comment, status, created_at)
select o.store_id, null, o.user_id, o.id, 3 + (o.i % 3), case when o.i % 2 = 0 then 'Entrega rápida, produto conforme o anúncio.' end, 'published', o.created_at + interval '1 day'
  from tmp_o o where o.status = 'delivered' and o.i % 3 = 0 limit 30000;
insert into reviews (store_id, product_id, user_id, order_id, rating, comment, status, created_at)
select o.store_id, i.product_id, o.user_id, null, 3 + (o.i % 3), 'Gostei do produto.', 'published', o.created_at + interval '2 days'
  from tmp_o o join tmp_i i on i.order_id = o.id and i.k = 1 where o.status = 'delivered' and o.i % 9 = 4 limit 10000;

commit;

reset synchronous_commit;
analyze;
select 'stores' as t, count(*) from stores union all select 'products', count(*) from products union all select 'variants', count(*) from product_variants
union all select 'users', count(*) from users union all select 'orders', count(*) from orders union all select 'order_items', count(*) from order_items
union all select 'order_events', count(*) from order_events union all select 'reviews', count(*) from reviews union all select 'media_assets', count(*) from media_assets;
