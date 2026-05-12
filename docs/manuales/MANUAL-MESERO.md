# Manual del Mesero — WiFi Voucher Manager

## Imprimir un QR para WiFi

1. Abre la aplicación **WiFi Voucher Manager** (icono en el escritorio).
2. En la pantalla principal, presiona el botón grande **"Imprimir QR de WiFi"**.
3. El ticket sale por la impresora térmica en aproximadamente 4 segundos.
4. Entrega el ticket al cliente — él escanea el QR con la cámara de su celular y se conecta al WiFi automáticamente.

## Indicadores de estado

- **Punto verde** "Sistema listo": todo OK, puedes imprimir.
- **Punto amarillo** "Sin impresora activa": pide al administrador revisar la impresora.
- **Punto rojo** "Sin contraseña configurada": pide al administrador rotar la contraseña.

Si ves un **punto ámbar pequeño arriba-derecha**, el sistema detectó un problema en la verificación nocturna. Avisa al administrador para que revise los logs.

## Banner persistente "Aplicación manual de contraseña pendiente"

Si aparece un banner rojo con una contraseña grande:

1. La rotación automática falló — el router no aceptó la nueva contraseña.
2. Avisa al administrador. Él tiene que copiar esa contraseña, configurarla en el router manualmente y confirmar la acción desde la pantalla de Administración.
3. **Mientras tanto, NO imprimas tickets** — los clientes intentarán conectarse con la contraseña nueva pero el router todavía acepta la vieja.

## ¿Qué hacer si la impresión falla?

1. Aparece un banner rojo con un botón **"Reintentar"**.
2. Presiona "Reintentar". Si funciona, listo.
3. Si sigue fallando, verifica que la impresora esté encendida y tenga papel.
4. Si después de revisar la impresora sigue fallando, avisa al administrador.

## Contacto

- **Soporte técnico:** Okuni Solutions
- **Si no funciona nada:** llama al administrador. NO reinicies la laptop sin avisar — los tickets impresos se pueden perder.
