# Zona de administración — DexCuba

Todo lo que hay en `/admin/` es **solo para administradores**. No enlaces estas
páginas desde el sitio público.

Contenido actual:
- `sandbox.html` — panel de diagnóstico y pruebas del escrow sobre la testnet Nile.

## Proteger con Cloudflare Access (obligatorio)

Sin esto, cualquiera puede abrir `dexcuba.com/admin/sandbox.html`. La propia
página muestra un aviso rojo si detecta que Access no está activo.

### Pasos (una sola vez)

1. En el panel de Cloudflare, entra en **Zero Trust** (menú lateral).
   La primera vez te pedirá elegir un nombre de equipo y un plan: el **Free**
   cubre hasta 50 usuarios, suficiente.

2. Ve a **Access → Applications → Add an application → Self-hosted**.

3. Configura la aplicación:
   - **Application name**: `DexCuba Admin`
   - **Session Duration**: 24 horas (o lo que prefieras)
   - **Application domain**:
     - Subdomain: *(vacío)*
     - Domain: `dexcuba.com`
     - Path: `admin`

   Con `Path: admin` proteges toda la carpeta, incluidas las páginas que añadas
   después.

4. **Add policy**:
   - **Policy name**: `Solo administradores`
   - **Action**: `Allow`
   - **Include** → `Emails` → escribe tu correo (y el de tu equipo si lo hay).

   Alternativas útiles en *Include*: `Emails ending in` para todo un dominio,
   o un proveedor de identidad (Google, GitHub) si lo configuras en
   *Settings → Authentication*.

5. Guarda. A partir de ahora, al abrir `dexcuba.com/admin/...` Cloudflare pedirá
   el correo, enviará un código de un solo uso, y solo entrará quien esté en la
   política.

### Verificar que funciona

Abre `https://dexcuba.com/admin/sandbox.html` en una ventana de incógnito:
debe aparecer la pantalla de login de Cloudflare, no el panel. Una vez dentro,
la página mostrará en verde la sesión con la que entraste.

## Al añadir más páginas de administración

Colócalas dentro de `/admin/` y quedarán protegidas automáticamente por la misma
política. No hace falta tocar nada más.
