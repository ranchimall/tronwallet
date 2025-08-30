const options = { method: "GET", headers: { accept: "application/json" } };
let nextUrl = null;

async function transactionHistory(url, address) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();

    const historyDiv = document.getElementById("historyOutput");
    historyDiv.innerHTML = "";

    if (data && data.data) {
      console.log(data.data);

      data.data.forEach((tx) => {
        const hash = tx.txID;
        const block = tx.blockNumber;
        const age = new Date(tx.block_timestamp).toLocaleString();
        const type = tx.raw_data.contract[0].type;

        let from = "";
        let to = "";
        let amount = "";
        let extraContractLine = "";

        if (type === "TransferContract") {
          const v = tx.raw_data.contract[0].parameter.value;
          from = tronWeb.address.fromHex(v.owner_address);
          to = tronWeb.address.fromHex(v.to_address);
          amount = v.amount / 1e6 + " TRX";
        } else if (type === "TriggerSmartContract") {
          const v = tx.raw_data.contract[0].parameter.value;

          from = tronWeb.address.fromHex(v.owner_address);

          const contractBase58 = tronWeb.address.fromHex(v.contract_address);
          extraContractLine = `
            <p><b>Contract:</b> ${contractBase58}
              <button onclick="copyToClipboard('${contractBase58}')"><i class="fas fa-copy"></i></button>
            </p>`;

          const input = (v.data || "").startsWith("0x")
            ? v.data.slice(2)
            : v.data || "";
          const method = input.slice(0, 8).toLowerCase();

          if (method === "a9059cbb" && input.length >= 8 + 64 + 64) {
            const addrSlot = input.slice(8, 8 + 64);
            const amountSlot = input.slice(8 + 64, 8 + 64 + 64);

            const evmAddrHex = addrSlot.slice(24);
            const tronHex = "41" + evmAddrHex.toLowerCase();
            to = tronWeb.address.fromHex(tronHex);

            const raw = BigInt("0x" + amountSlot);
            amount = Number(raw) / 1e6 + " USDT";
          } else {
            to = "—";
            amount = "—";
          }
        }

        const result = tx.ret?.[0]?.contractRet || "UNKNOWN";
        const statusColor = result === "SUCCESS" ? "green" : "red";

        // create card
        const card = document.createElement("div");
        card.className = "tx-card";

        card.innerHTML = `
          <p><b>Hash:</b> ${truncate(hash)}
            <button onclick="copyToClipboard('${hash}')"><i class="fas fa-copy"></i></button></p>
          <p><b>Block:</b> ${block}</p>
          <p><b>Age:</b> ${age}</p>
          <p><b>Type:</b> ${type}</p>
          <p><b>From:</b> ${from}
            <button onclick="copyToClipboard('${from}')"><i class="fas fa-copy"></i></button></p>
          <p><b>To:</b> ${to}
            <button onclick="copyToClipboard('${to}')"><i class="fas fa-copy"></i></button></p>
          ${extraContractLine}
          <p><b>Amount:</b> <span style="color:#0f0;font-weight:bold">${amount}</span></p>
          <p><b>Status:</b> <span style="color:${statusColor}">${result}</span></p>
        `;

        historyDiv.appendChild(card);
      });

      // save nextUrl for pagination
      if (data.meta && data.meta.fingerprint) {
        nextUrl = `https://api.shasta.trongrid.io/v1/accounts/${address}/transactions?limit=10&fingerprint=${encodeURIComponent(
          data.meta.fingerprint
        )}`;
      } else {
        nextUrl = null;
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function fetchNext(address) {
  if (nextUrl) {
    transactionHistory(nextUrl, address);
  }
}

function truncate(str, len = 12) {
  if (!str) return "";
  return str.length > len ? str.slice(0, 6) + "..." + str.slice(-6) : str;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert("Copied: " + text);
  });
}

// State for filtering and pagination
let __nextUrl = null;
let __prevUrls = [];
let __currentAddress = "";
let __currentTxs = [];
let __currentFilter = "all"; // all | received | sent
let __currentPage = 1;
let __currentUrl = null;
let __perPage = 10;

const __origTransactionHistory = transactionHistory;
transactionHistory = async function (url, address) {
  try {
    if (typeof notify === "function")
      notify("Loading transactions...", "success", 1500);
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
    });
    const data = await response.json();

    const section = document.getElementById("transactionSection");
    if (section) section.style.display = "block";

    __currentAddress = address;
    __currentUrl = url;
    window.lastUsedUrl = url;

    if (data && data.data) {
      __currentTxs = data.data;
      // track current per-page from url
      const m = url.match(/limit=(\d+)/);
      if (m) __perPage = parseInt(m[1], 10) || __perPage;
      __renderTransactions();

      if (data.meta && data.meta.fingerprint) {
        __nextUrl = `https://api.shasta.trongrid.io/v1/accounts/${address}/transactions?limit=${__perPage}&fingerprint=${encodeURIComponent(
          data.meta.fingerprint
        )}`;
      } else {
        __nextUrl = null;
      }
      __updatePagination();
    }
    return data;
  } catch (e) {
    console.error(e);
    if (typeof __origTransactionHistory === "function") {
      __origTransactionHistory(url, address);
    }
    throw e;
  }
};

function __renderTransactions() {
  const list = document.getElementById("txList");
  const legacy = document.getElementById("historyOutput");
  if (!list) {
    if (legacy) legacy.innerHTML = "";
    return;
  }
  list.innerHTML = "";

  const filtered = __currentTxs.filter((tx) => {
    const type = tx.raw_data?.contract?.[0]?.type || "";
    let from = "";
    let to = "";
    if (type === "TransferContract") {
      const v = tx.raw_data.contract[0].parameter.value;
      from = tronWeb.address.fromHex(v.owner_address);
      to = tronWeb.address.fromHex(v.to_address);
    } else if (type === "TriggerSmartContract") {
      const v = tx.raw_data.contract[0].parameter.value;
      from = tronWeb.address.fromHex(v.owner_address);
      const input = (v.data || "").startsWith("0x")
        ? v.data.slice(2)
        : v.data || "";
      const method = input.slice(0, 8).toLowerCase();
      if (method === "a9059cbb" && input.length >= 8 + 64 + 64) {
        const addrSlot = input.slice(8, 8 + 64);
        const evmAddrHex = addrSlot.slice(24);
        const tronHex = "41" + evmAddrHex.toLowerCase();
        to = tronWeb.address.fromHex(tronHex);
      }
    }
    if (__currentFilter === "sent") return from === __currentAddress;
    if (__currentFilter === "received") return to === __currentAddress;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML =
      '<div class="no-transactions"><i class="fas fa-inbox"></i>No transactions found</div>';
    return;
  }

  filtered.forEach((tx) => {
    const hash = tx.txID;
    const block = tx.blockNumber;
    const age = new Date(tx.block_timestamp).toLocaleString();
    const type = tx.raw_data.contract[0].type;

    let from = "";
    let to = "";
    let amountText = "";
    let directionClass = "";
    let icon = "fa-arrow-up";

    if (type === "TransferContract") {
      const v = tx.raw_data.contract[0].parameter.value;
      from = tronWeb.address.fromHex(v.owner_address);
      to = tronWeb.address.fromHex(v.to_address);
      const amount = v.amount / 1e6;
      amountText = amount + " TRX";
    } else if (type === "TriggerSmartContract") {
      const v = tx.raw_data.contract[0].parameter.value;
      from = tronWeb.address.fromHex(v.owner_address);
      const input = (v.data || "").startsWith("0x")
        ? v.data.slice(2)
        : v.data || "";
      const method = input.slice(0, 8).toLowerCase();
      if (method === "a9059cbb" && input.length >= 8 + 64 + 64) {
        const addrSlot = input.slice(8, 8 + 64);
        const amountSlot = input.slice(8 + 64, 8 + 64 + 64);
        const evmAddrHex = addrSlot.slice(24);
        const tronHex = "41" + evmAddrHex.toLowerCase();
        to = tronWeb.address.fromHex(tronHex);
        const raw = BigInt("0x" + amountSlot);
        amountText = Number(raw) / 1e6 + " USDT";
      }
      icon = "fa-file-signature";
    }

    // Set direction and icon based on transaction direction
    if (from === __currentAddress) {
      directionClass = "outgoing";
      icon = "fa-arrow-up"; // upward arrow for sent
    } else if (to === __currentAddress) {
      directionClass = "incoming";
      icon = "fa-arrow-down"; // downward arrow for received
    } else {
      directionClass = "";
      icon = "fa-exchange-alt"; // default for other transactions
    }
    const result = tx.ret?.[0]?.contractRet || "UNKNOWN";
    const statusClass = result === "SUCCESS" ? "success" : "failed";

    const card = document.createElement("div");
    card.className = `transaction-card ${directionClass}`;
    card.innerHTML = `
      <div class="tx-main">
        <div class="tx-icon"><i class="fas ${icon}"></i></div>
        <div class="tx-info">
          <div class="tx-header">
            <div>
              <div class="tx-direction">${
                directionClass === "incoming"
                  ? "Received"
                  : directionClass === "outgoing"
                  ? "Sent"
                  : type
              }</div>
              <div class="tx-date">${age}</div>
            </div>
            <div class="tx-right-info">
              <div class="tx-amount ${
                directionClass === "incoming" ? "incoming" : "outgoing"
              }">${amountText}</div>
              <div class="tx-status ${statusClass}">${result}</div>
            </div>
          </div>
          <div class="tx-addresses">
            <div class="tx-address-row"><span class="address-label">From</span><span class="address-value" 
                onclick="window.open('index.html?page=transactions&address=${from}','_blank')" 
                title="View address details">${from}</span></div>
            <div class="tx-address-row"><span class="address-label">To</span><span class="address-value" 
                onclick="window.open('index.html?page=transactions&address=${to}','_blank')" 
                title="View address details">${to}</span></div>
            <div class="tx-hash"><span class="hash-label">Hash</span><span class="hash-value"><span class="detail-link"
                onclick="window.open('index.html?page=transactions&tx=${hash}','_blank')" 
                title="View transaction details">${hash}</span></span></div>
          </div>
        </div>
      </div>`;
    list.appendChild(card);
  });
}

function __updatePagination() {
  const nextBtn = document.getElementById("nextBtn");
  const prevBtn = document.getElementById("prevBtn");
  const info = document.getElementById("paginationInfo");
  const pageNumbers = document.getElementById("pageNumbers");
  if (nextBtn) nextBtn.disabled = !__nextUrl;
  if (prevBtn) prevBtn.disabled = __prevUrls.length === 0;
  if (info) info.textContent = `Page ${__currentPage} • ${__perPage} / page`;
  if (pageNumbers) pageNumbers.innerHTML = __renderPageNumbers();
}

function setTransactionFilter(filter) {
  __currentFilter = filter;
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-filter") === filter);
  });
  __renderTransactions();
}

function goToNextPage() {
  if (__nextUrl) {
    if (__currentUrl) {
      __prevUrls.push({ url: __currentUrl, page: __currentPage });
    }
    __currentPage += 1;
    transactionHistory(__nextUrl, __currentAddress);
  }
}

function goToPreviousPage() {
  if (__prevUrls.length === 0) return;
  const prev = __prevUrls.pop();
  const prevUrl = prev.url;
  __currentPage = Math.max(1, prev.page || __currentPage - 1);
  if (prevUrl) {
    window.lastUsedUrl = prevUrl;
    transactionHistory(prevUrl, __currentAddress);
  }
}

// simple numeric pagination with ellipses
function __renderPageNumbers() {
  const parts = [];
  const push = (n, active) =>
    `<div class="page-number ${active ? "active" : ""}">${n}</div>`;
  // Always show 1
  if (__currentPage === 1) parts.push(push(1, true));
  else parts.push(push(1, false));
  // Ellipsis if we're beyond page 3
  if (__currentPage > 3) parts.push('<div class="page-ellipsis">…</div>');
  // Middle window
  const start = Math.max(2, __currentPage - 1);
  const end = __nextUrl ? __currentPage + 1 : __currentPage; // if has next, show one ahead
  for (let n = start; n <= end; n++) {
    parts.push(push(n, n === __currentPage));
  }

  if (__nextUrl) parts.push('<div class="page-ellipsis">…</div>');
  return parts.join("");
}

function resetHistoryState(perPage) {
  __prevUrls = [];
  __currentPage = 1;
  __currentUrl = null;
  __nextUrl = null;
  __perPage = perPage || 10;
}
