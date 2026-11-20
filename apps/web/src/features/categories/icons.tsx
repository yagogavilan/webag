'use client';

import {
  Armchair, AppleLogo, Baby, Backpack, Balloon, Basket, BeerBottle, Bicycle, BookOpen, Bread, Cake, Car, Carrot, CookingPot, Coffee, DeviceMobile, Diamond, Dog, Fish, FirstAidKit, Flower, GameController, Gift, Hamburger, Hammer, Handbag, Headphones, Heartbeat, House, Laptop, Lightbulb, Motorcycle, PaintBrush, PawPrint, Pencil, Pill, Pizza, Plant, ShoppingBag, Sneaker, Sparkle, Storefront, Tag, Television, TShirt, Watch, Wine, Wrench, DotsThree, Package,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';

type IconType = ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone'; 'aria-hidden'?: boolean | 'true' }>;

/** Biblioteca fixa de ícones de categoria (WB-106 C1): nomes Phosphor devolvidos pela API, com rótulo em português. */
const ICONS: Record<string, { icon: IconType; label: string }> = {
  basket: { icon: Basket, label: 'Cesta' },
  'shopping-bag': { icon: ShoppingBag, label: 'Sacola' },
  storefront: { icon: Storefront, label: 'Loja' },
  pizza: { icon: Pizza, label: 'Pizza' },
  hamburger: { icon: Hamburger, label: 'Hambúrguer' },
  bread: { icon: Bread, label: 'Pão' },
  cake: { icon: Cake, label: 'Bolo' },
  coffee: { icon: Coffee, label: 'Café' },
  'beer-bottle': { icon: BeerBottle, label: 'Cerveja' },
  wine: { icon: Wine, label: 'Vinho' },
  'apple-logo': { icon: AppleLogo, label: 'Maçã' },
  carrot: { icon: Carrot, label: 'Cenoura' },
  fish: { icon: Fish, label: 'Peixe' },
  'cooking-pot': { icon: CookingPot, label: 'Panela' },
  pill: { icon: Pill, label: 'Remédio' },
  'first-aid-kit': { icon: FirstAidKit, label: 'Primeiros socorros' },
  heartbeat: { icon: Heartbeat, label: 'Saúde' },
  flower: { icon: Flower, label: 'Flor' },
  plant: { icon: Plant, label: 'Planta' },
  'paw-print': { icon: PawPrint, label: 'Pet' },
  dog: { icon: Dog, label: 'Cachorro' },
  baby: { icon: Baby, label: 'Bebê' },
  // O Phosphor não tem "teddy-bear"; o rótulo mantém o nome que o admin espera e o desenho é um balão.
  'teddy-bear': { icon: Balloon, label: 'Brinquedo' },
  'game-controller': { icon: GameController, label: 'Videogame' },
  'book-open': { icon: BookOpen, label: 'Livro' },
  pencil: { icon: Pencil, label: 'Papelaria' },
  backpack: { icon: Backpack, label: 'Mochila' },
  't-shirt': { icon: TShirt, label: 'Camiseta' },
  sneaker: { icon: Sneaker, label: 'Tênis' },
  handbag: { icon: Handbag, label: 'Bolsa' },
  watch: { icon: Watch, label: 'Relógio' },
  diamond: { icon: Diamond, label: 'Joia' },
  'device-mobile': { icon: DeviceMobile, label: 'Celular' },
  laptop: { icon: Laptop, label: 'Notebook' },
  headphones: { icon: Headphones, label: 'Fone' },
  television: { icon: Television, label: 'TV' },
  house: { icon: House, label: 'Casa' },
  armchair: { icon: Armchair, label: 'Móveis' },
  lightbulb: { icon: Lightbulb, label: 'Lâmpada' },
  wrench: { icon: Wrench, label: 'Ferramenta' },
  hammer: { icon: Hammer, label: 'Construção' },
  'paint-brush': { icon: PaintBrush, label: 'Pintura' },
  car: { icon: Car, label: 'Carro' },
  motorcycle: { icon: Motorcycle, label: 'Moto' },
  bicycle: { icon: Bicycle, label: 'Bicicleta' },
  gift: { icon: Gift, label: 'Presente' },
  sparkle: { icon: Sparkle, label: 'Brilho' },
  tag: { icon: Tag, label: 'Etiqueta' },
  'dots-three': { icon: DotsThree, label: 'Outros' },
};

export function iconLabel(name: string): string {
  return ICONS[name]?.label ?? name;
}

export function CategoryIcon({ name, size = 24 }: { name: string; size?: number }) {
  const Icon = ICONS[name]?.icon ?? Package;
  return <Icon size={size} aria-hidden="true" />;
}
