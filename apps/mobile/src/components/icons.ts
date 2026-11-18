/* eslint-disable @typescript-eslint/no-require-imports */
// Único ponto de importação de ícones (Phosphor, identidade.md). Cada ícone é importado pelo caminho do arquivo:
// o Metro não faz tree-shaking do pacote e a biblioteca inteira (1.500 ícones) pesa no Android de entrada.
// require() e não import: o TypeScript não deve checar o fonte .tsx da biblioteca.
import type { Icon } from 'phosphor-react-native';

export type IconComponent = Icon;

export const Eye: Icon = require('phosphor-react-native/src/icons/Eye').Eye as Icon;
export const EyeSlash: Icon = require('phosphor-react-native/src/icons/EyeSlash').EyeSlash as Icon;
export const CaretLeft: Icon = require('phosphor-react-native/src/icons/CaretLeft').CaretLeft as Icon;
export const CaretDown: Icon = require('phosphor-react-native/src/icons/CaretDown').CaretDown as Icon;
export const CaretRight: Icon = require('phosphor-react-native/src/icons/CaretRight').CaretRight as Icon;
export const CheckCircle: Icon = require('phosphor-react-native/src/icons/CheckCircle').CheckCircle as Icon;
export const WarningCircle: Icon = require('phosphor-react-native/src/icons/WarningCircle').WarningCircle as Icon;
export const WifiSlash: Icon = require('phosphor-react-native/src/icons/WifiSlash').WifiSlash as Icon;
export const MapPin: Icon = require('phosphor-react-native/src/icons/MapPin').MapPin as Icon;
export const MapPinLine: Icon = require('phosphor-react-native/src/icons/MapPinLine').MapPinLine as Icon;
export const Crosshair: Icon = require('phosphor-react-native/src/icons/Crosshair').Crosshair as Icon;
export const Check: Icon = require('phosphor-react-native/src/icons/Check').Check as Icon;
export const X: Icon = require('phosphor-react-native/src/icons/X').X as Icon;
export const DotsThree: Icon = require('phosphor-react-native/src/icons/DotsThree').DotsThree as Icon;
export const Plus: Icon = require('phosphor-react-native/src/icons/Plus').Plus as Icon;
export const Info: Icon = require('phosphor-react-native/src/icons/Info').Info as Icon;
export const EnvelopeSimple: Icon = require('phosphor-react-native/src/icons/EnvelopeSimple').EnvelopeSimple as Icon;
export const Trash: Icon = require('phosphor-react-native/src/icons/Trash').Trash as Icon;
export const PencilSimple: Icon = require('phosphor-react-native/src/icons/PencilSimple').PencilSimple as Icon;
export const House: Icon = require('phosphor-react-native/src/icons/House').House as Icon;
export const Briefcase: Icon = require('phosphor-react-native/src/icons/Briefcase').Briefcase as Icon;
export const Warning: Icon = require('phosphor-react-native/src/icons/Warning').Warning as Icon;
export const Handbag: Icon = require('phosphor-react-native/src/icons/Handbag').Handbag as Icon;
export const MagnifyingGlass: Icon = require('phosphor-react-native/src/icons/MagnifyingGlass').MagnifyingGlass as Icon;
export const Star: Icon = require('phosphor-react-native/src/icons/Star').Star as Icon;
export const Storefront: Icon = require('phosphor-react-native/src/icons/Storefront').Storefront as Icon;
export const Heart: Icon = require('phosphor-react-native/src/icons/Heart').Heart as Icon;
export const ShareNetwork: Icon = require('phosphor-react-native/src/icons/ShareNetwork').ShareNetwork as Icon;
export const Clock: Icon = require('phosphor-react-native/src/icons/Clock').Clock as Icon;
export const Truck: Icon = require('phosphor-react-native/src/icons/Truck').Truck as Icon;
export const ArrowsClockwise: Icon = require('phosphor-react-native/src/icons/ArrowsClockwise').ArrowsClockwise as Icon;
export const Tag: Icon = require('phosphor-react-native/src/icons/Tag').Tag as Icon;
export const SquaresFour: Icon = require('phosphor-react-native/src/icons/SquaresFour').SquaresFour as Icon;
export const ClockCounterClockwise: Icon = require('phosphor-react-native/src/icons/ClockCounterClockwise').ClockCounterClockwise as Icon;
export const SealCheck: Icon = require('phosphor-react-native/src/icons/SealCheck').SealCheck as Icon;
export const User: Icon = require('phosphor-react-native/src/icons/User').User as Icon;
export const Package: Icon = require('phosphor-react-native/src/icons/Package').Package as Icon;
export const Minus: Icon = require('phosphor-react-native/src/icons/Minus').Minus as Icon;
export const CaretUp: Icon = require('phosphor-react-native/src/icons/CaretUp').CaretUp as Icon;
export const Gift: Icon = require('phosphor-react-native/src/icons/Gift').Gift as Icon;
export const SignIn: Icon = require('phosphor-react-native/src/icons/SignIn').SignIn as Icon;
export const Sliders: Icon = require('phosphor-react-native/src/icons/Sliders').Sliders as Icon;
export const ArrowsDownUp: Icon = require('phosphor-react-native/src/icons/ArrowsDownUp').ArrowsDownUp as Icon;
export const Bag: Icon = require('phosphor-react-native/src/icons/Bag').Bag as Icon;
export const Image: Icon = require('phosphor-react-native/src/icons/Image').Image as Icon;
export const SmileySad: Icon = require('phosphor-react-native/src/icons/SmileySad').SmileySad as Icon;
export const Receipt: Icon = require('phosphor-react-native/src/icons/Receipt').Receipt as Icon;
export const Ruler: Icon = require('phosphor-react-native/src/icons/Ruler').Ruler as Icon;
export const UserCircle: Icon = require('phosphor-react-native/src/icons/UserCircle').UserCircle as Icon;
export const Question: Icon = require('phosphor-react-native/src/icons/Question').Question as Icon;
export const ArrowRight: Icon = require('phosphor-react-native/src/icons/ArrowRight').ArrowRight as Icon;
