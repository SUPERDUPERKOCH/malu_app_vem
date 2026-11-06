import { Platform } from 'react-native';

/** Serifada da marca: "serif" não existe no iOS, que usa Georgia. */
export const serifFont = Platform.select({ ios: 'Georgia', default: 'serif' });
/** Sem serifa do sistema (usada no SVG do story, que não herda a fonte padrão do app). */
export const sansFont = Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' });
