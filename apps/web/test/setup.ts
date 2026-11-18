import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom não implementa rolagem.
Element.prototype.scrollIntoView ??= () => undefined;

afterEach(() => cleanup());
