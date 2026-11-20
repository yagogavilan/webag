import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom não implementa rolagem.
if (typeof Element !== 'undefined') Element.prototype.scrollIntoView ??= () => undefined;

afterEach(() => cleanup());
