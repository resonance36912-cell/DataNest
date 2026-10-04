export type PortfolioRole="owner"|"admin"|"operator"|"viewer";
export type PortfolioItemKind="governed_product"|"product_candidate"|"application"|"module"|"capability"|"external_capability";
export type PortfolioReviewState="pending_review"|"classified"|"deprecated"|"retired";
export type PortfolioClassification="product_owned"|"shared_datanest_capability"|"independent_datanest_product"|"registered_external_capability";
export type PortfolioLifecycle="concept"|"experiment"|"validating"|"candidate"|"active"|"maintained"|"deprecated"|"retired";
export type PortfolioRelationshipType="contains"|"uses"|"provides"|"depends_on"|"replaces"|"supersedes"|"integrates_with"|"derived_from";

export type PortfolioRegistryRow={
  id:string;
  project_id:string;
  slug:string;
  name:string;
  item_kind:PortfolioItemKind;
  review_state:PortfolioReviewState;
  current_lifecycle:PortfolioLifecycle|null;
  linked_product_id:string|null;
  source_authority:string|null;
  source_reference:string|null;
  metadata:Record<string,unknown>;
  active_classification_id:string|null;
  active_classification:PortfolioClassification|null;
  target_product_id:string|null;
  target_product_slug:string|null;
  target_product_name:string|null;
  outgoing_relationship_count:number;
  incoming_relationship_count:number;
  product_lab_surface_count:number;
  product_lab_test_run_count:number;
};

export function portfolioKindLabel(value:PortfolioItemKind){
  return ({
    governed_product:"Product",
    product_candidate:"Candidate",
    application:"Application",
    module:"Module",
    capability:"Capability",
    external_capability:"External capability"
  } as const)[value];
}

export function portfolioClassificationLabel(value:PortfolioClassification|null){
  if(!value)return "Pending Review";
  return ({
    product_owned:"Owned",
    shared_datanest_capability:"Shared DataNest",
    independent_datanest_product:"Independent Product",
    registered_external_capability:"External"
  } as const)[value];
}

export function portfolioLifecycleLabel(value:PortfolioLifecycle|null){
  if(!value)return "Unstaged";
  return value.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());
}

export function canProposePortfolio(role:PortfolioRole){
  return role==="owner"||role==="admin"||role==="operator";
}

export function canApprovePortfolio(role:PortfolioRole){
  return role==="owner"||role==="admin";
}
