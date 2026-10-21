package com.barbeariamachado.gestao;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ManagedAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
