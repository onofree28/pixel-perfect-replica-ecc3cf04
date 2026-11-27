import { describe, expect, it } from 'vitest';
import { isApproval } from './approval';
describe('isApproval', () => {
  it('aceita autorização para enviar ao git', () => { expect(isApproval('pode enviar')).toBe(true); expect(isApproval('gostei, manda pro github')).toBe(true); });
  it('não trata pedidos novos como autorização', () => { expect(isApproval('mude a cor do botão')).toBe(false); });
});
