import UIKit
import ImageIO
import Capacitor

@objc(MachadoDevicePlugin)
public class MachadoDevicePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MachadoDevicePlugin"
    public let jsName = "MachadoDevice"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "preparePhoto", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "copyText", returnType: CAPPluginReturnPromise)
    ]

    @objc public func preparePhoto(_ call: CAPPluginCall) {
        guard let encoded = call.getString("base64"), encoded.utf8.count <= 35_000_000 else {
            call.reject("Escolha uma foto de até 25 MB.")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            guard let bytes = Data(base64Encoded: encoded),
                  let source = CGImageSourceCreateWithData(bytes as CFData, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                    kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true,
                    kCGImageSourceThumbnailMaxPixelSize: 1600,
                    kCGImageSourceShouldCacheImmediately: true
                  ] as CFDictionary),
                  let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.85),
                  jpeg.count <= 3 * 1024 * 1024 else {
                call.reject("Não foi possível preparar esta foto. Escolha outra imagem.")
                return
            }
            call.resolve(["base64": jpeg.base64EncodedString(), "mimeType": "image/jpeg"])
        }
    }

    @objc public func copyText(_ call: CAPPluginCall) {
        guard let text = call.getString("text"), text.utf8.count <= 10_000 else {
            call.reject("Não foi possível copiar este texto.")
            return
        }
        DispatchQueue.main.async {
            UIPasteboard.general.string = text
            call.resolve()
        }
    }
}
