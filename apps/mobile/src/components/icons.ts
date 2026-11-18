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
