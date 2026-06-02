import Icon from '../components/Icon'

function LoginPage({
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  onSubmit,
}) {
  return (
    <section className="page-wrap auth-page">
    

      <form className="login-panel" onSubmit={onSubmit} autoComplete="on">
        <div className="form-heading">
          <Icon name="logIn" />
          <div>
            <h2>Masuk akun</h2>
            <p>Gunakan username/email dan password</p>
          </div>
        </div>

        <label>
          Username atau email
          <input
            type="text"
            name="username"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            placeholder="nama@email.com atau username"
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Minimal 6 karakter"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="btn btn-primary full" type="submit">
          <Icon name="arrowRight" />
          Masuk Dashboard
        </button>
      </form>
    </section>
  )
}

export default LoginPage
