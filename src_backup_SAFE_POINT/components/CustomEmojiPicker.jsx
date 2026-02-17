import React, { useState } from 'react';
import { Smile, Heart, ThumbsUp, Coffee, Star, X } from 'lucide-react';

const EMOJI_CATEGORIES = {
    faces: {
        icon: <Smile size={20} />,
        label: "Faccine",
        emojis: [
            "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🥲", "☺️", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗",
            "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥸", "🤩", "🥳", "😏", "😒", "😞", "😔", "jg", "😟",
            "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨"
        ]
    },
    people_hands: {
        icon: <ThumbsUp size={20} />,
        label: "Mani",
        emojis: [
            "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍",
            "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦿", "🦶", "👂"
        ]
    },
    hearts: {
        icon: <Heart size={20} />,
        label: "Cuori",
        emojis: [
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️",
            "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏"
        ]
    },
    objects: {
        icon: <Coffee size={20} />,
        label: "Oggetti",
        emojis: [
            "☕", "🍵", "🍶", "🍾", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🥤", "🧃", "🧉", "🧊", "🥢", "🍽️", "🍴", "🥄", "🔪",
            "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🥅", "⛳", "🪁"
        ]
    },
    stars: {
        icon: <Star size={20} />,
        label: "Simboli",
        emojis: [
            "✨", "⭐️", "🌟", "💫", "⚡️", "☄️", "💥", "🔥", "🌪️", "🌈", "☀️", "🌤️", "⛅️", "🌥️", "☁️", "🌦️", "Mw", "⛈️", "yw", "☃️",
            "❄️", "🌬️", "💨", "💧", "💦", "☔️", "☂️", "🌊", "🌫️", "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈"
        ]
    }
};

export default function CustomEmojiPicker({ onEmojiClick }) {
    const [activeCategory, setActiveCategory] = useState('faces');

    return (
        <div style={{
            background: '#202c33',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '280px',
            width: '100%',
            maxWidth: '320px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            border: '1px solid rgba(134,150,160,0.15)'
        }}>
            {/* Category Tabs */}
            <div style={{
                display: 'flex',
                background: '#111b21',
                padding: '8px 0',
                borderBottom: '1px solid rgba(134,150,160,0.15)'
            }}>
                {Object.entries(EMOJI_CATEGORIES).map(([key, cat]) => (
                    <button
                        key={key}
                        onClick={() => setActiveCategory(key)}
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: activeCategory === key ? '#00a884' : '#8696a0',
                            borderBottom: activeCategory === key ? '2px solid #00a884' : '2px solid transparent',
                            padding: '8px 0',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            transition: 'all 0.2s'
                        }}
                        title={cat.label}
                    >
                        {cat.icon}
                    </button>
                ))}
            </div>

            {/* Emoji Grid */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(36px, 1fr))',
                gap: '4px',
                alignContent: 'start'
            }}>
                {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, index) => (
                    <button
                        key={index}
                        onClick={() => onEmojiClick({ emoji })}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '4px',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#2a3942'}
                        onMouseLeave={(e) => e.target.style.background = 'transparent'}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </div>
    );
}
