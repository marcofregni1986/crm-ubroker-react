import React from "react";
import { LeadingActions, SwipeableList, SwipeableListItem, SwipeAction, TrailingActions, Type } from "react-swipeable-list";
// import "react-swipeable-list/dist/styles.css";
import { Phone, MessageCircle } from "lucide-react"; // Using MessageCircle as WhatsApp proxy if needed

// Helper Styles
const actionStyles = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "80px", // Width of swipe area
    height: "100%",
    color: "white",
    fontSize: "12px",
    flexDirection: "column",
    gap: "4px"
};

export default function SwipeableActionWrapper({ children, onCall, onWhatsApp, item }) {

    // LEFT SWIPE (Swipe Right to Trigger) -> CALL
    const leadingActions = () => (
        <LeadingActions>
            <SwipeAction onClick={() => onCall && onCall(item)}>
                <div style={{ ...actionStyles, backgroundColor: "#22c55e" }}> {/* Green */}
                    <Phone size={20} />
                    <span>Chiama</span>
                </div>
            </SwipeAction>
        </LeadingActions>
    );

    // RIGHT SWIPE (Swipe Left to Trigger) -> WHATSAPP
    const trailingActions = () => (
        <TrailingActions>
            <SwipeAction onClick={() => onWhatsApp && onWhatsApp(item)}>
                <div style={{ ...actionStyles, backgroundColor: "#25D366" }}> {/* WhatsApp Green/Teal */}
                    <span style={{ fontSize: 20, fontWeight: 'bold' }}>💬</span>
                    <span>WhatsApp</span>
                </div>
            </SwipeAction>
        </TrailingActions>
    );

    return (
        <SwipeableListItem
            leadingActions={onCall ? leadingActions() : null}
            trailingActions={onWhatsApp ? trailingActions() : null}
        >
            <div style={{ width: "100%", touchAction: "pan-y" }}>
                {children}
            </div>
        </SwipeableListItem>
    );
}
