import Foundation
import Capacitor

@objc(ManagedAccessPlugin)
public class ManagedAccessPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ManagedAccessPlugin"
    public let jsName = "ManagedAccess"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "credentials", returnType: CAPPluginReturnPromise)
    ]

    @objc public func credentials(_ call: CAPPluginCall) {
        guard let resource = Bundle.main.url(forResource: "ManagedAccess.private", withExtension: "plist"),
              let bytes = try? Data(contentsOf: resource),
              let values = (try? PropertyListSerialization.propertyList(from: bytes, options: [], format: nil)) as? [String: Any],
              values["verificationOnly"] as? Bool == false,
              let email = values["email"] as? String, !email.isEmpty,
              let password = values["password"] as? String, password.count >= 12 else {
            call.reject("O acesso deste aplicativo não foi configurado.")
            return
        }
        call.resolve(["email": email, "password": password])
    }
}
