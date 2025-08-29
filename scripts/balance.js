async function getBalanceByAddress(address) {
  try {
    const balance = await tronWeb.trx.getBalance(address);
    return balance / 1e6; 
  } catch (err) {
    throw new Error("Failed to fetch balance: " + err.message);
  }
}

async function getBalanceByPrivKey(privKey) {
  try {
    let rawHexKey;

    // Detect WIF (BTC/FLO style)
    if (/^[5KLc9RQ][1-9A-HJ-NP-Za-km-z]{50,}$/.test(privKey)) {
      const decoded = coinjs.wif2privkey(privKey);
      if (!decoded || !decoded.privkey) {
        throw new Error("Invalid WIF private key");
      }
      rawHexKey = decoded.privkey;

      // Detect 64-char raw hex private key
    } else if (/^[0-9a-fA-F]{64}$/.test(privKey)) {
      rawHexKey = privKey;
    } else {
      throw new Error("Unsupported private key format");
    }

    // Derive Tron address from private key
    const tronAddress = tronWeb.address.fromPrivateKey(rawHexKey);
    const balance = await getBalanceByAddress(tronAddress);

    return { tronAddress, balance };
  } catch (err) {
    throw new Error("Invalid private key: " + err.message);
  }
}


async function runBalanceCheck() {
  const inputVal = document.getElementById("balanceAddr").value.trim();
  const out = document.getElementById("balanceOutput");

  // Set loading state
  if (typeof setButtonLoading === "function") {
    setButtonLoading("balanceBtn", true);
  }

  try {
    if (inputVal.startsWith("T")) {
      // Direct Tron address
      const balance = await getBalanceByAddress(inputVal);
      out.innerHTML = `
        <div class="card balance-info">
          <div class="balance-header">
            <h3><i class="fas fa-coins"></i> Account Balance</h3>
          </div>
          <div class="balance-display"><span class="balance-amount">${balance} TRX</span></div>
          <div class="account-details">
            <div class="detail-row">
              <label>Address:</label>
              <div class="address-container">
                <span class="address-text">${inputVal}</span>
                <button class="btn-icon" onclick="navigator.clipboard.writeText('${inputVal}').then(()=>notify && notify('Copied','success'))" title="Copy"><i class="fas fa-copy"></i></button>
              </div>
            </div>
          </div>
        </div>
      `;
      if (typeof notify === "function") notify("Balance loaded", "success");
    } else {
      // Treat as private key (WIF or HEX)
      const { tronAddress, balance } = await getBalanceByPrivKey(inputVal);
      out.innerHTML = `
        <div class="card balance-info">
          <div class="balance-header">
            <h3><i class="fas fa-coins"></i> Account Balance</h3>
          </div>
          <div class="balance-display"><span class="balance-amount">${balance} TRX</span></div>
          <div class="account-details">
            <div class="detail-row">
              <label>Derived Address:</label>
              <div class="address-container">
                <span class="address-text">${tronAddress}</span>
                <button class="btn-icon" onclick="navigator.clipboard.writeText('${tronAddress}').then(()=>notify && notify('Copied','success'))" title="Copy"><i class="fas fa-copy"></i></button>
              </div>
            </div>
          </div>
        </div>
      `;
      if (typeof notify === "function") notify("Balance loaded", "success");
    }
  } catch (err) {
    out.innerHTML = `<div class="error-state"><i class="fas fa-triangle-exclamation"></i>${err.message}</div>`;
    if (typeof notify === "function") notify(err.message, "error");
  } finally {
    // Clear loading state
    if (typeof setButtonLoading === "function") {
      setButtonLoading("balanceBtn", false);
    }
  }
}
