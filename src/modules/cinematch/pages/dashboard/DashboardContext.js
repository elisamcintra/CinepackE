import { createContext, useContext } from 'react';

// Compartilhado entre as abas do Dashboard:
//   abrirDetalhes(titulo)     -> abre o modal de detalhes
//   marcar(titulo, payload)   -> Já vi / Quero ver / Não me interessa (avisa todas as abas)
//   ouvirMudancas(fn)         -> a aba é avisada quando um título muda de status (devolve "cancelar")
export const DashboardContext = createContext(null);
export const useDashboard = () => useContext(DashboardContext);
