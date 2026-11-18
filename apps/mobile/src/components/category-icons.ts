/* eslint-disable @typescript-eslint/no-require-imports */
// Biblioteca fixa de ícones de categoria (WB-106 C1, nomes do Phosphor em kebab-case). Mesma lista do admin e da API.
// 'teddy-bear' não existe nesta versão do Phosphor: cai no ícone neutro.
// Importados por arquivo: o Metro não faz tree-shaking do pacote inteiro.
import type { Icon } from 'phosphor-react-native';

import { SquaresFour } from './icons';

const byName: Record<string, Icon> = {
  'basket': require('phosphor-react-native/src/icons/Basket').Basket as Icon,
  'shopping-bag': require('phosphor-react-native/src/icons/ShoppingBag').ShoppingBag as Icon,
  'storefront': require('phosphor-react-native/src/icons/Storefront').Storefront as Icon,
  'pizza': require('phosphor-react-native/src/icons/Pizza').Pizza as Icon,
  'hamburger': require('phosphor-react-native/src/icons/Hamburger').Hamburger as Icon,
  'bread': require('phosphor-react-native/src/icons/Bread').Bread as Icon,
  'cake': require('phosphor-react-native/src/icons/Cake').Cake as Icon,
  'coffee': require('phosphor-react-native/src/icons/Coffee').Coffee as Icon,
  'beer-bottle': require('phosphor-react-native/src/icons/BeerBottle').BeerBottle as Icon,
  'wine': require('phosphor-react-native/src/icons/Wine').Wine as Icon,
  'apple-logo': require('phosphor-react-native/src/icons/AppleLogo').AppleLogo as Icon,
  'carrot': require('phosphor-react-native/src/icons/Carrot').Carrot as Icon,
  'fish': require('phosphor-react-native/src/icons/Fish').Fish as Icon,
  'cooking-pot': require('phosphor-react-native/src/icons/CookingPot').CookingPot as Icon,
  'pill': require('phosphor-react-native/src/icons/Pill').Pill as Icon,
  'first-aid-kit': require('phosphor-react-native/src/icons/FirstAidKit').FirstAidKit as Icon,
  'heartbeat': require('phosphor-react-native/src/icons/Heartbeat').Heartbeat as Icon,
  'flower': require('phosphor-react-native/src/icons/Flower').Flower as Icon,
  'plant': require('phosphor-react-native/src/icons/Plant').Plant as Icon,
  'paw-print': require('phosphor-react-native/src/icons/PawPrint').PawPrint as Icon,
  'dog': require('phosphor-react-native/src/icons/Dog').Dog as Icon,
  'baby': require('phosphor-react-native/src/icons/Baby').Baby as Icon,
  'game-controller': require('phosphor-react-native/src/icons/GameController').GameController as Icon,
  'book-open': require('phosphor-react-native/src/icons/BookOpen').BookOpen as Icon,
  'pencil': require('phosphor-react-native/src/icons/Pencil').Pencil as Icon,
  'backpack': require('phosphor-react-native/src/icons/Backpack').Backpack as Icon,
  't-shirt': require('phosphor-react-native/src/icons/TShirt').TShirt as Icon,
  'sneaker': require('phosphor-react-native/src/icons/Sneaker').Sneaker as Icon,
  'handbag': require('phosphor-react-native/src/icons/Handbag').Handbag as Icon,
  'watch': require('phosphor-react-native/src/icons/Watch').Watch as Icon,
  'diamond': require('phosphor-react-native/src/icons/Diamond').Diamond as Icon,
  'device-mobile': require('phosphor-react-native/src/icons/DeviceMobile').DeviceMobile as Icon,
  'laptop': require('phosphor-react-native/src/icons/Laptop').Laptop as Icon,
  'headphones': require('phosphor-react-native/src/icons/Headphones').Headphones as Icon,
  'television': require('phosphor-react-native/src/icons/Television').Television as Icon,
  'house': require('phosphor-react-native/src/icons/House').House as Icon,
  'armchair': require('phosphor-react-native/src/icons/Armchair').Armchair as Icon,
  'lightbulb': require('phosphor-react-native/src/icons/Lightbulb').Lightbulb as Icon,
  'wrench': require('phosphor-react-native/src/icons/Wrench').Wrench as Icon,
  'hammer': require('phosphor-react-native/src/icons/Hammer').Hammer as Icon,
  'paint-brush': require('phosphor-react-native/src/icons/PaintBrush').PaintBrush as Icon,
  'car': require('phosphor-react-native/src/icons/Car').Car as Icon,
  'motorcycle': require('phosphor-react-native/src/icons/Motorcycle').Motorcycle as Icon,
  'bicycle': require('phosphor-react-native/src/icons/Bicycle').Bicycle as Icon,
  'gift': require('phosphor-react-native/src/icons/Gift').Gift as Icon,
  'sparkle': require('phosphor-react-native/src/icons/Sparkle').Sparkle as Icon,
  'tag': require('phosphor-react-native/src/icons/Tag').Tag as Icon,
  'dots-three': require('phosphor-react-native/src/icons/DotsThree').DotsThree as Icon,
};

/** Ícone da categoria pelo nome vindo da API; nome desconhecido (biblioteca nova) cai num ícone neutro. */
export function categoryIcon(name: string): Icon {
  return byName[name] ?? SquaresFour;
}
