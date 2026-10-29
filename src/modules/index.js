// Registro dos módulos do hub. Cada novo projeto entra nesta lista.
import { cinematchModule } from './cinematch/routes.jsx';

export const modules = [cinematchModule];

// Módulo aberto por padrão ao entrar no app
export const defaultModule = cinematchModule;
