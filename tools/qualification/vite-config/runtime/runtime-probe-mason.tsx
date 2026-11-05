import { css } from 'styled-system/css';

export function Probe({ revision }: { revision: number }) {
  const updated = revision === 2;
  return <masonview id="mason-probe" style={{ display: 'flex', flexDirection: 'column',
    alignItems: 'flex-start', width: updated ? 220 : 200, height: updated ? 160 : 140, padding: 7 }}>
    <label id="preset-probe" text={'PINNED_PRESET_20261105:' + revision}
      style={{ width: updated ? 100 : 80, height: updated ? 40 : 30 }}
      className={css({ color: 'primary', margin: '4' })} />
    <label id="mason-sibling" text="MASON_SIBLING" style={{ width: 60, height: 20 }} />
  </masonview>;
}
