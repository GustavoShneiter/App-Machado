type DismissibleLayer = {
  id: number
  dismiss: () => void
}

let nextLayerId = 0
const layers: DismissibleLayer[] = []

export function registerDismissibleLayer(dismiss: () => void) {
  const layer = { id: ++nextLayerId, dismiss }
  layers.push(layer)

  return () => {
    const index = layers.findIndex(item => item.id === layer.id)
    if (index >= 0) layers.splice(index, 1)
  }
}

export function dismissTopLayer() {
  const layer = layers.pop()
  if (!layer) return false

  layer.dismiss()
  return true
}
