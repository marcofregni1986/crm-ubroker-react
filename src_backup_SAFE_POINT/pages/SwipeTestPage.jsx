import React from 'react';
import { LeadingActions, SwipeableList, SwipeableListItem, SwipeAction, TrailingActions, Type } from 'react-swipeable-list';
import 'react-swipeable-list/dist/styles.css';

export default function SwipeTestPage() {
    const leadingActions = () => (
        <LeadingActions>
            <SwipeAction onClick={() => alert('Swipe Right triggered!')}>
                <div style={{ background: 'green', color: 'white', padding: 20 }}>Action Left</div>
            </SwipeAction>
        </LeadingActions>
    );

    const trailingActions = () => (
        <TrailingActions>
            <SwipeAction onClick={() => alert('Swipe Left triggered!')}>
                <div style={{ background: 'red', color: 'white', padding: 20 }}>Action Right</div>
            </SwipeAction>
        </TrailingActions>
    );

    return (
        <div style={{ padding: 20, maxWidth: 400, margin: '0 auto' }}>
            <h1>Swipe Test Page</h1>
            <p>Try to swipe the item below.</p>

            <div style={{ border: '1px solid #ccc', margin: '20px 0' }}>
                <SwipeableList fullSwipe={false} type={Type.IOS}>
                    <SwipeableListItem
                        leadingActions={leadingActions()}
                        trailingActions={trailingActions()}
                    >
                        <div style={{ padding: 20, background: 'white', width: '100%', borderBottom: '1px solid #eee' }}>
                            Swipe Me (IOS Type)
                        </div>
                    </SwipeableListItem>
                </SwipeableList>
            </div>

            <div style={{ border: '1px solid #ccc', margin: '20px 0' }}>
                <h3>Many independent lists (Current Implementation)</h3>
                {[1, 2, 3].map(i => (
                    <SwipeableList key={i} fullSwipe={false} threshold={0.5}>
                        <SwipeableListItem
                            leadingActions={leadingActions()}
                            trailingActions={trailingActions()}
                        >
                            <div style={{ padding: 20, background: '#f0f0f0', width: '100%', borderBottom: '1px solid #ccc' }}>
                                Row {i}
                            </div>
                        </SwipeableListItem>
                    </SwipeableList>
                ))}
            </div>
        </div>
    );
}
