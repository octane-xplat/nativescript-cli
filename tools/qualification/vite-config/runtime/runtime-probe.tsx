import { css } from 'styled-system/css';

export function Probe({ revision }: { revision: number }) {
  return <label id="preset-probe" text={'PINNED_PRESET_20261105:' + revision}
    className={css({ color: 'primary', margin: '4' })} />;
}
