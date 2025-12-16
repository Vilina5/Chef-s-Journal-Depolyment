import React from 'react';

interface IconProps {
	name: string;
	className?: string;
	onClick?: () => void;
}

const Icon: React.FC<IconProps> = ({ name, className = "", onClick }) => {
	return <i className={`fa-solid fa-${name} ${className}`} onClick={onClick} />;
};

export default Icon;