import { Fragment } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { modules, defaultModule } from './modules/index.js';

export default function App() {
  return (
    <Routes>
      {/* A raiz do hub redireciona para o módulo padrão (por enquanto, o CineMatch) */}
      <Route path="/" element={<Navigate to={defaultModule.basePath} replace />} />
      {/* Cada módulo declara as próprias rotas (ex.: tudo sob /cinematch) */}
      {modules.map((m) => (
        <Fragment key={m.id}>{m.routes}</Fragment>
      ))}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
