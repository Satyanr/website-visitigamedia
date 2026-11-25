import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePageMeta } from '@/hooks/usePageMeta';

function Metadata() {
  usePageMeta({ title: 'Test', description: 'Test description', pathname: '/about/', lang: 'en' });
  return null;
}

afterEach(() => vi.unstubAllEnvs());
describe('staging indexing policy', () => {
  it('keeps noindex when client metadata renders an otherwise indexable page', () => {
    vi.stubEnv('VITE_NOINDEX', 'true');
    render(<Metadata />);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  });
  it('keeps normal indexing for a production build', () => {
    vi.stubEnv('VITE_NOINDEX', 'false');
    render(<Metadata />);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  });
});
