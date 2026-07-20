# Despliegue en Vercel

Este proyecto ya esta preparado para desplegarse en Vercel como una app Vite + React con API Express.

## Configuracion en Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

## Variables opcionales

- `OPENAI_API_KEY`: activa la extraccion de facturas con IA.
- `OPENAI_MODEL`: modelo para extraccion de facturas. Si no se define usa `gpt-4.1-mini`.
- `CURRENT_INVENTORY_PATH`: solo sirve en servidores con archivo local accesible. En Vercel normalmente no aplica.

## Importante sobre datos

En Vercel no existe el archivo local `C:\Users\user\Downloads\copia inventario.xlsx`.
Para produccion se recomienda una de estas opciones:

1. Usar la importacion desde Google Sheets/Excel desde la pantalla `Sheets/CSV`.
2. Conectar una base de datos para que varias personas compartan el mismo inventario.

Mientras no haya base de datos, los datos quedan guardados en el navegador de cada usuario.
