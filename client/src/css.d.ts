// ANCHOR: autorise les variables CSS personnalisées (--c, ...) dans l'attribut style
import 'react';
declare module 'react' {
  interface CSSProperties {
    [cle: `--${string}`]: string | number | undefined;
  }
}
