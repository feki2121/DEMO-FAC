import React from "react";
import { PrintHeaderProps } from "@/types/print";

const DEFAULT_COMPANY = {
  name: "KF SOLUTIONS",
  address: "Rte Tunis km 4.5 -  SFAX",
  phone: "25 535 035",
  vat: "XXXXXXXXXXXXXXXX",
  logo: "kf.jpg",
};

export const PrintHeader: React.FC<PrintHeaderProps> = ({
  format,
  title,
  reference,
  date,
  companyName = DEFAULT_COMPANY.name,
  companyAddress = DEFAULT_COMPANY.address,
  companyPhone = DEFAULT_COMPANY.phone,
  companyVAT = DEFAULT_COMPANY.vat,
  logoUrl = DEFAULT_COMPANY.logo,
}) => {
  const isTicket = format === "TICKET";

  return (
    <div className={`header ${isTicket ? "ticket" : ""}`}>
      <div className="logo-container">
        <img
          src={logoUrl}
          alt="Company Logo"
          className="logo"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </div>
      <div className="company-info">
        <div className="company-name">{companyName}</div>
        <div className="company-details">Vente en Gros Produits Divers</div>
        <div className="company-details">{companyAddress}</div>
        <div className="company-details">Tél: {companyPhone}</div>
        {!isTicket && <div className="company-details">T.V.A.: {companyVAT}</div>}
      </div>
      {!isTicket && <div style={{ flex: "0 0 auto", width: "150px" }}></div>}
    </div>
  );
};
