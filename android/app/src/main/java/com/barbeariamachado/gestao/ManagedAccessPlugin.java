package com.barbeariamachado.gestao;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Acesso da distribuição privada da barbearia; nunca incluído no site. */
@CapacitorPlugin(name = "ManagedAccess")
public class ManagedAccessPlugin extends Plugin {
    @PluginMethod
    public void credentials(PluginCall call) {
        if (BuildConfig.MANAGED_EMAIL.isEmpty() || BuildConfig.MANAGED_PASSWORD.isEmpty()) {
            call.reject("O acesso deste aplicativo não foi configurado.");
            return;
        }
        JSObject result = new JSObject();
        result.put("email", BuildConfig.MANAGED_EMAIL);
        result.put("password", BuildConfig.MANAGED_PASSWORD);
        call.resolve(result);
    }
}
