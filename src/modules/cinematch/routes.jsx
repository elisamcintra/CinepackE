import { lazy } from 'react';
import { Route } from 'react-router';
import RequireAuth from '../../shared/auth/RequireAuth.jsx';
import AppLayout from '../../shared/layout/AppLayout.jsx';
import AttributionFooter from './components/AttributionFooter.jsx';
import Entrada from './pages/Entrada.jsx';
import Login from './pages/Login.jsx';

// As páginas maiores são carregadas só quando a pessoa abre (o site inicial fica mais leve)
const Combinado = lazy(() => import('./pages/Combinado.jsx'));
const Configuracao = lazy(() => import('./pages/Configuracao.jsx'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard.jsx'));
const Escolha = lazy(() => import('./pages/Escolha.jsx'));
const Historico = lazy(() => import('./pages/Historico.jsx'));
const Quiz = lazy(() => import('./pages/Quiz.jsx'));

const LOGIN = '/cinematch/login';
const protegida = (elemento) => <RequireAuth loginPath={LOGIN}>{elemento}</RequireAuth>;

// Todas as rotas do CineMatch ficam sob /cinematch.
// Para adicionar outro projeto ao hub, crie src/modules/<nome>/routes.jsx igual a este.
export const cinematchModule = {
  id: 'cinematch',
  nome: 'CineMatch',
  basePath: '/cinematch',
  routes: (
    <Route
      path="/cinematch"
      element={
        <AppLayout
          title="CineMatch"
          homePath="/cinematch"
          footer={<AttributionFooter />}
          links={[
            { to: '/cinematch/app/para-voce', texto: 'Recomendações' },
            { to: '/cinematch/inicio', texto: 'Novo perfil' },
          ]}
        />
      }
    >
      <Route index element={<Entrada />} />
      <Route path="login" element={<Login />} />
      <Route path="configuracao" element={<Configuracao />} />
      <Route path="inicio" element={protegida(<Escolha />)} />
      <Route path="historico" element={protegida(<Historico />)} />
      <Route path="quiz" element={protegida(<Quiz />)} />
      <Route path="combinado" element={protegida(<Combinado />)} />
      <Route path="app" element={protegida(<Dashboard />)} />
      <Route path="app/:aba" element={protegida(<Dashboard />)} />
    </Route>
  ),
};
