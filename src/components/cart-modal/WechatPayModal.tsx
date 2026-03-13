interface WechatPayModalProps {
  cnyTotal: string;
  wechatQr: string;
  onCopyOrder: () => void;
  onClose: () => void;
}

export default function WechatPayModal({
  cnyTotal,
  wechatQr,
  onCopyOrder,
  onClose,
}: WechatPayModalProps) {
  return (
    <div className="modal-overlay center">
      <div className="wechat-pay-modal">
        <div className="wechat-icon-circle"></div>

        <div className="wechat-title">Molimo platite</div>
        <div className="wechat-subtitle">请扫码支付</div>
        <div className="wechat-amount">¥ {cnyTotal} CNY</div>

        <div className="wechat-hint">
          ↑ Pritisnite dugo da skenirate / 长按识别支付 ↑
        </div>

        {wechatQr && (
          <img
            src={wechatQr}
            alt="WeChat QR"
            style={{
              width: "220px",
              height: "220px",
              margin: "10px auto 20px",
              display: "block",
              borderRadius: "12px",
              border: "2px solid #4caf50",
            }}
          />
        )}

        {!wechatQr && (
          <div
            style={{
              color: "#999",
              fontSize: "14px",
              marginBottom: "20px",
            }}
          >
            (未配置二维码 / No QR configured)
          </div>
        )}

        <button className="btn-wechat-confirm" onClick={onCopyOrder}>
          Kopiraj i Plati / 复制订单并支付
        </button>

        <div className="wechat-note">
          Klikom iznad kopirate detalje porudžbine, zatim ih pošaljite prodavcu
          na WeChat.
          <br />
          点击上方按钮复制订单，然后发给商家。
        </div>

        <button className="btn-wechat-close" onClick={onClose}>
          Zatvori / 关闭
        </button>
      </div>
    </div>
  );
}
