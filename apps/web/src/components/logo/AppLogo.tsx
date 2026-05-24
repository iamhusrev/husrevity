interface Props {
  collapsed?: boolean;
}

const AppLogo = ({ collapsed = false }: Props) => {
  if (collapsed) {
    return (
      <span className="text-xl font-bold bg-gradient-to-r from-husrev-amber to-husrev-ember bg-clip-text text-transparent">
        hy
      </span>
    );
  }

  return (
    <span className="text-2xl font-bold bg-gradient-to-r from-husrev-amber to-husrev-ember bg-clip-text text-transparent">
      husrevity
    </span>
  );
};

export default AppLogo;
