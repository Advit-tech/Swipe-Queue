// SwipeQueue.js — Spicetify Swipe-to-Queue Extension
// Features: Playlist & Search Swipe + Ctrl+Shift+Z Undo Queue

(function SwipeQueue() {
    if (!Spicetify?.Platform?.PlayerAPI) {
        setTimeout(SwipeQueue, 300);
        return;
    }

    // Stack to keep track of URIs added via swipe for Ctrl+Shift+Z undo
    const addedQueueHistory = [];

    // Comprehensive target selectors across standard playlists, search menus, and cards
    const TRACK_SELECTOR = [
        ".main-trackList-trackListRow",
        "[data-testid='tracklist-row']",
        "[data-testid='search-result-row']",
        "[data-testid='top-result-card']",
        "[role='option']",
        "[role='row']"
    ].join(", ");

    const THRESHOLD = 70;
    const MAX_SLIDE = 130;
    const ANIMATION_MS = 220;

    // 1. Inject Style Rules
    const style = document.createElement("style");
    style.id = "swipe-queue-styles";
    style.textContent = `
        /* Green Backdrop */
        .swipe-queue-backdrop {
            position: absolute;
            top: 0;
            bottom: 0;
            left: 0;
            width: ${MAX_SLIDE}px;
            z-index: 0;
            background-color: #1ed760;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            padding-left: 18px;
            color: #000000;
            font-weight: 700;
            font-size: 13px;
            pointer-events: none;
            user-select: none;
            transform: translateX(-100%);
            will-change: transform;
            clip-path: inset(0 0 0 0 round 4px);
        }

        /* Content Layer Cells */
        .swipe-queue-cell {
            position: relative !important;
            z-index: 1 !important;
            will-change: transform;
        }

        /* Smooth Physics Curve */
        .swipe-queue-animating {
            transition: transform ${ANIMATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
    `;
    document.head.appendChild(style);

    // 2. Keyboard Shortcut: Ctrl + Shift + Z (Undo Queue)
    document.addEventListener("keydown", async (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyZ") {
            e.preventDefault();

            if (addedQueueHistory.length === 0) {
                Spicetify.showNotification("No recent swipe tracks to remove from queue");
                return;
            }

            const lastTrackUri = addedQueueHistory.pop();
            const removeFn = Spicetify.removeFromQueue || Spicetify.Platform?.PlayerAPI?.removeFromQueue;

            if (removeFn) {
                try {
                    await removeFn([{ uri: lastTrackUri }]);
                    Spicetify.showNotification("Removed track from queue");
                } catch (err) {
                    console.error("[SwipeQueue] Remove error:", err);
                    Spicetify.showNotification("Failed to remove track from queue");
                }
            } else {
                Spicetify.showNotification("Remove from queue API unavailable");
            }
        }
    });

    // 3. Robust Universal Track URI Extractor
    function getTrackUri(row) {
        // Direct datasets
        if (row.dataset?.uri?.includes(":track:")) return row.dataset.uri;

        // Search internal interactive components
        const playButton = row.querySelector("button[aria-label*='Play'], button[data-testid='play-button']");
        if (playButton?.dataset?.uri?.includes(":track:")) return playButton.dataset.uri;

        const trackLink = row.querySelector("a[href*='/track/']");
        if (trackLink?.href) {
            const match = trackLink.href.match(/\/track\/([a-zA-Z0-9]+)/);
            if (match) return `spotify:track:${match[1]}`;
        }

        // React Fiber Traversal (Crucial for 1st song in playlists)
        const key = Object.keys(row).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (!key) return null;

        let curr = row[key];
        let depth = 0;
        while (curr && depth < 25) {
            const props = curr.memoizedProps || curr.pendingProps;
            if (props) {
                const testUri = props.uri || props.track?.uri || props.item?.uri || props.entity?.uri || props.data?.uri || props.trackUri;
                if (typeof testUri === 'string' && testUri.includes(":track:")) {
                    return testUri;
                }
            }
            curr = curr.return;
            depth++;
        }
        return null;
    }

    // 4. Attach Swipe Handler
    function bindSwipeToRow(row) {
        if (row.dataset.swipeQueueBound || row.closest("[data-swipe-queue-bound='true']")) return;

        // Exclude table headers (only allow valid track rows)
        if (row.getAttribute("role") === "columnheader" || (row.getAttribute("aria-rowindex") === "1" && row.querySelector("[aria-sort]"))) {
            return;
        }

        const trackUri = getTrackUri(row);
        const isSongItem = trackUri !== null || 
                           row.innerText?.includes("Song •") || 
                           row.classList.contains("main-trackList-trackListRow") ||
                           row.getAttribute("data-testid") === "top-result-card" ||
                           row.getAttribute("data-testid") === "tracklist-row";

        if (!isSongItem) return;

        row.dataset.swipeQueueBound = "true";

        if (window.getComputedStyle(row).position === "static") {
            row.style.position = "relative";
        }
        row.style.overflow = "hidden";

        row.addEventListener("dragstart", (e) => e.preventDefault());

        // Create Backdrop
        const backdrop = document.createElement("div");
        backdrop.className = "swipe-queue-backdrop";
        backdrop.innerHTML = `<span>➔ Queue</span>`;
        row.appendChild(backdrop);

        // Tag Content Layer
        const children = Array.from(row.children);
        children.forEach(child => {
            if (child !== backdrop) {
                child.classList.add("swipe-queue-cell");
            }
        });

        const getSlidingElements = () => row.querySelectorAll(".swipe-queue-cell");

        // Physics State
        let targetX = 0;
        let currentX = 0;
        let axisLocked = null;
        let idleTimer = null;
        let animFrameId = null;
        let isQueued = false;

        const updatePhysics = () => {
            currentX += (targetX - currentX) * 0.25;

            if (Math.abs(targetX - currentX) < 0.1) {
                currentX = targetX;
            }

            const contentElements = getSlidingElements();
            contentElements.forEach(el => {
                el.style.transform = `translateX(${currentX}px)`;
            });

            const backdropPercent = -100 + ((currentX / MAX_SLIDE) * 100);
            backdrop.style.transform = `translateX(${backdropPercent}%)`;

            if (Math.abs(targetX - currentX) >= 0.1 || idleTimer !== null) {
                animFrameId = requestAnimationFrame(updatePhysics);
            } else {
                animFrameId = null;
            }
        };

        const resetVisuals = () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }

            const contentElements = getSlidingElements();
            backdrop.classList.add("swipe-queue-animating");
            contentElements.forEach(el => el.classList.add("swipe-queue-animating"));

            row.offsetWidth; // Force CSS reflow

            backdrop.style.transform = `translateX(-100%)`;
            contentElements.forEach(el => {
                el.style.transform = `translateX(0px)`;
            });

            targetX = 0;
            currentX = 0;
            axisLocked = null;
            isQueued = false;

            setTimeout(() => {
                backdrop.classList.remove("swipe-queue-animating");
                contentElements.forEach(el => el.classList.remove("swipe-queue-animating"));
            }, ANIMATION_MS);
        };

        function onWheel(e) {
            if (Math.abs(e.deltaX) === 0 && Math.abs(e.deltaY) % 120 === 0) return;

            const deltaX = -e.deltaX;
            const deltaY = e.deltaY;

            if (axisLocked === null) {
                if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
                    if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
                        axisLocked = 'x';
                    } else {
                        axisLocked = 'y';
                    }
                } else {
                    return;
                }
            }

            if (axisLocked === 'y') return;

            e.preventDefault();
            e.stopPropagation();

            if (idleTimer) clearTimeout(idleTimer);

            const contentElements = getSlidingElements();
            backdrop.classList.remove("swipe-queue-animating");
            contentElements.forEach(el => el.classList.remove("swipe-queue-animating"));

            targetX = Math.min(Math.max(targetX + deltaX, 0), MAX_SLIDE);

            if (targetX >= THRESHOLD && !isQueued) {
                isQueued = true;
                const uri = getTrackUri(row);
                if (uri) {
                    Spicetify.Platform.PlayerAPI.addToQueue([{ uri }])
                        .then(() => {
                            addedQueueHistory.push(uri); // Store URI for Ctrl+Shift+Z undo
                            Spicetify.showNotification("Added to queue");
                        })
                        .catch(err => console.error("[SwipeQueue] Queue error:", err));
                } else {
                    Spicetify.showNotification("Couldn't read track URI");
                }
            }

            if (!animFrameId) {
                animFrameId = requestAnimationFrame(updatePhysics);
            }

            idleTimer = setTimeout(resetVisuals, 90);
        }

        row.addEventListener("wheel", onWheel, { passive: false });
        row.addEventListener("touchend", resetVisuals, { passive: true });
        row.addEventListener("touchcancel", resetVisuals, { passive: true });
    }

    // 5. Scanner & Observer
    function scanRows() {
        const rows = document.querySelectorAll(TRACK_SELECTOR);
        rows.forEach(bindSwipeToRow);
    }

    scanRows();
    const observer = new MutationObserver(() => scanRows());
    observer.observe(document.body, { childList: true, subtree: true });

    console.log("[SwipeQueue] Enhanced track binding & Ctrl+Shift+Z undo shortcut active.");
})();