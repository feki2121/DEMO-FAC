import React from "react";
import { PrintFooterProps } from "@/types/print";

const DEFAULT_COMPANY = {
  name: "KF SOLUTIONS",
  address: "Rte Tunis km 4.5 -  SFAX",
  phone: "25 535 035",
};

export const PrintFooter: React.FC<PrintFooterProps> = ({
  format,
  companyName = DEFAULT_COMPANY.name,
  companyAddress = DEFAULT_COMPANY.address,
  companyPhone = DEFAULT_COMPANY.phone,
  customMessage,
}) => {
  const isTicket = format === "TICKET";

  return (
    <div className={`footer ${isTicket ? "ticket" : ""}`}>
      {customMessage ? (
        <div>{customMessage}</div>
      ) : (
        <>
          <div>
            {companyName} - {companyAddress} - Tél: {companyPhone}
          </div>
        </>
      )}
    </div>
  );
};
