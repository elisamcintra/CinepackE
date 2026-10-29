import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../../../shared/auth/AuthProvider.jsx';
import Spinner from '../../../shared/ui/Spinner.jsx';
import { ErrorState } from '../../../shared/ui/States.jsx';
import { temPerfil } from '../lib/profile.js';

// Porta de entrada do /cinematch: decide para onde a pessoa vai.
//   sem configuração -> Configuração | sem login -> Login
//   com perfil -> Dashboard          | sem perfil -> Home de escolha
export default function Entrada() {
  const { configurado, carregando, user } = useAuth();
  const [destino, setDestino] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!user) return;
    temPerfil()
      .then((tem) => setDestino(tem ? '/cinematch/app/para-voce' : '/cinematch/inicio'))
      .catch((e) => setErro(e.message));
  }, [user]);

  if (!configurado) return <Navigate to="/cinematch/configuracao" replace />;
  if (!carregando && !user) return <Navigate to="/cinematch/login" replace />;
  if (destino) return <Navigate to={destino} replace />;
  if (erro) {
    const semTabelas = /could not find the table|does not exist|schema cache/i.test(erro);
    return (
      <div className="py-12">
        <ErrorState
          mensagem={semTabelas ? 'As tabelas do banco ainda não existem. Rode o arquivo supabase/schema.sql no SQL Editor do Supabase (veja o README).' : erro}
          onTentar={() => window.location.reload()}
        />
        <p className="mt-4 text-center text-sm">
          <Link to="/cinematch/configuracao" className="text-cine-accent hover:underline">
            Ver configuração
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner />
    </div>
  );
}
