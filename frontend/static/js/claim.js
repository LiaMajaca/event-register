document.addEventListener('DOMContentLoaded', () => {
    const displayEventIdSpan = document.getElementById('displayEventId');
    const connectWalletButton = document.getElementById('connectWalletButton');
    const claimBadgeButton = document.getElementById('claimBadgeButton');
    const walletAddressDisplay = document.getElementById('walletAddressDisplay');
    const claimResultDiv = document.getElementById('claimResult');

    let eventId = null;
    let signer = null;
    let userWalletAddress = null;

    // Read eventId from URL
    const urlParams = new URLSearchParams(window.location.search);
    eventId = urlParams.get('eventId');

    if (eventId) {
        displayEventIdSpan.textContent = eventId;
    } else {
        displayEventIdSpan.textContent = 'N/A (Event ID not found in URL)';
        claimBadgeButton.disabled = true;
    }

    connectWalletButton.addEventListener('click', async () => {
        if (typeof window.ethereum !== 'undefined') {
            try {
                const provider = new ethers.providers.Web3Provider(window.ethereum);
                await provider.send("eth_requestAccounts", []);
                signer = provider.getSigner();
                userWalletAddress = await signer.getAddress();
                walletAddressDisplay.textContent = `Connected: ${userWalletAddress}`;
                claimBadgeButton.style.display = 'block';
                connectWalletButton.style.display = 'none';
            } catch (error) {
                console.error("Error connecting to wallet:", error);
                walletAddressDisplay.textContent = 'Failed to connect wallet.';
            }
        } else {
            alert('MetaMask or a compatible Ethereum wallet is not installed.');
        }
    });

    claimBadgeButton.addEventListener('click', async () => {
        if (!eventId || !userWalletAddress) {
            claimResultDiv.className = 'message error';
            claimResultDiv.textContent = 'Please connect your wallet and ensure Event ID is present.';
            claimResultDiv.style.display = 'block';
            return;
        }

        try {
            const response = await fetch('http://127.0.0.1:8000/claim_badge', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ eventId: parseInt(eventId), walletAddress: userWalletAddress }),
            });

            const data = await response.json();

            if (response.ok) {
                claimResultDiv.className = 'message success';
                claimResultDiv.textContent = data.message;
            } else {
                claimResultDiv.className = 'message error';
                claimResultDiv.textContent = `Error: ${data.detail || 'Something went wrong.'}`;
            }
        } catch (error) {
            claimResultDiv.className = 'message error';
            claimResultDiv.textContent = `Network error: ${error.message}`;
        }
        claimResultDiv.style.display = 'block';
    });
});