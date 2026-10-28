import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('container dependency lock contract', () => {
  const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const instructions = dockerfile.split('\n').map((line) => line.trim());

  it('requires the committed lockfile in both dependency stages', () => {
    expect(instructions.filter((line) => line === 'COPY package.json package-lock.json ./')).toHaveLength(2);
    expect(dockerfile).not.toContain('package-lock.json*');
  });

  it('uses frozen dependency installs for build and production runtime', () => {
    expect(instructions.filter((line) => line === 'RUN npm ci')).toHaveLength(1);
    expect(instructions.filter((line) => line === 'RUN npm ci --omit=dev')).toHaveLength(1);
    expect(dockerfile).not.toMatch(/\bnpm\s+(?:install|i|update)\b/);
    expect(dockerfile).toContain('COPY --from=build /app/dist ./dist');
  });
});
