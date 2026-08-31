import { entrarComEmail } from "./action";

export default function PaginaLogin() {
  return (
    <main>
      <h1>Hello Doctor</h1>
      <form action={entrarComEmail}>
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <label htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" required autoComplete="current-password" />
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
