/**
 * Pure-JS QR codes — no native module (renders the QR matrix as a grid of
 * Views, run-length-merged per row). Used to share join links for rooms, pacts,
 * duels, and the wallet receive address.
 */
import { useMemo, useState } from "react"
import { Modal, Pressable, Share, View } from "react-native"
import qrcode from "qrcode-generator"
import { C } from "./theme"
import { PixelButton, PixelText } from "./ui"

export function QRCode({
  value,
  size = 212,
  color = "#0b1020",
  bg = "#ffffff",
  quietZone = 2,
}: {
  value: string
  size?: number
  color?: string
  bg?: string
  quietZone?: number
}) {
  const matrix = useMemo(() => {
    const qr = qrcode(0, "M")
    qr.addData(value || " ")
    qr.make()
    const count = qr.getModuleCount()
    const rows: boolean[][] = []
    for (let r = 0; r < count; r++) {
      const row: boolean[] = []
      for (let c = 0; c < count; c++) row.push(qr.isDark(r, c))
      rows.push(row)
    }
    return rows
  }, [value])

  const count = matrix.length
  const total = count + quietZone * 2
  const cell = Math.max(2, Math.floor(size / total))
  const pad = cell * quietZone
  const dim = cell * count + pad * 2

  return (
    <View style={{ width: dim, height: dim, backgroundColor: bg, padding: pad, borderRadius: 8 }}>
      {matrix.map((row, r) => {
        // run-length encode the row to cut View count
        const runs: { dark: boolean; len: number }[] = []
        for (const dark of row) {
          const last = runs[runs.length - 1]
          if (last && last.dark === dark) last.len++
          else runs.push({ dark, len: 1 })
        }
        return (
          <View key={r} style={{ flexDirection: "row", height: cell }}>
            {runs.map((run, i) => (
              <View key={i} style={{ width: cell * run.len, height: cell, backgroundColor: run.dark ? color : bg }} />
            ))}
          </View>
        )
      })}
    </View>
  )
}

/** A bottom-sheet that shows a QR + a copyable code + a Share button. */
export function QRModal({
  visible,
  title,
  value,
  code,
  hint,
  onClose,
}: {
  visible: boolean
  title: string
  value: string // what the QR encodes
  code?: string // human-readable code shown under the QR
  hint?: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    try {
      await Share.share({ message: value })
    } catch {
      /* ignore */
    }
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: C.frame,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            borderTopWidth: 1,
            borderTopColor: C.highlight,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 28,
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", alignSelf: "stretch", marginBottom: 16 }}>
            <PixelText size={14} tracking={2}>{title}</PixelText>
            <Pressable onPress={onClose} hitSlop={10}>
              <PixelText size={16} color={C.white45}>✕</PixelText>
            </Pressable>
          </View>

          <QRCode value={value} size={216} />

          {code != null && (
            <Pressable
              onPress={() => { setCopied(true) }}
              style={{ marginTop: 16, backgroundColor: C.panel, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 }}
            >
              <PixelText size={14} tracking={1}>{code}</PixelText>
            </Pressable>
          )}
          {copied && <PixelText size={9} upper={false} color={C.greenLight} style={{ marginTop: 6 }}>copied to share below</PixelText>}
          {hint && (
            <PixelText size={9} upper={false} color={C.white45} style={{ marginTop: 10, textAlign: "center", lineHeight: 14 }}>
              {hint}
            </PixelText>
          )}

          <PixelButton label="share" color={C.eth} onPress={share} style={{ alignSelf: "stretch", marginTop: 16 }} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}
