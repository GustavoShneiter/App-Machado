import UIKit
import Capacitor

@objc(MachadoViewController)
public class MachadoViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(ManagedAccessPlugin())
        bridge?.registerPluginInstance(MachadoDevicePlugin())
        statusBarStyle = .lightContent
    }
}
