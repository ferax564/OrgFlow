(function (root) {
root.ORGFLOW_TEMPLATES = {
  'first-light': {
    label: 'Startup · 8 people',
    blurb: 'A seed-stage product company with one vacant engineer.',
    palette: 'indigo',
    branding: { companyName: 'First Light', chartTitle: 'Company org', logo: null, darkLogo: null, includeExports: true, footer: 'Confidential' },
    planning: {
      version: 2, activeScenarioId: 'current',
      scenarios: [{
        id: 'current', name: 'Current', description: '', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', baseScenarioId: '', baseSnapshot: null,
        employees: [
          { id: 'EMP-001', name: 'Nia Brooks', employeeNumber: 'FL-01', photo: null },
          { id: 'EMP-002', name: 'Omar Shah', employeeNumber: 'FL-02', photo: null },
          { id: 'EMP-003', name: 'Elena Voss', employeeNumber: 'FL-03', photo: null },
          { id: 'EMP-004', name: 'Jonah Park', employeeNumber: 'FL-04', photo: null },
          { id: 'EMP-005', name: 'Amelia Cho', employeeNumber: 'FL-05', photo: null },
          { id: 'EMP-006', name: 'Chris Adeyemi', employeeNumber: 'FL-06', photo: null },
          { id: 'EMP-007', name: 'Sofia Rahman', employeeNumber: 'FL-07', photo: null }
        ],
        positions: [
          { id: 'POS-001', managerId: '', secondaryManagerId: '', title: 'Chief Executive Officer', type: 'Head', group: 'Leadership', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-001', startDate: '2024-01-08', endDate: '', location: 'Remote', costCenter: 'EXE', jobFamily: 'Leadership' },
          { id: 'POS-002', managerId: 'POS-001', secondaryManagerId: '', title: 'Head of Product', type: 'Head', group: 'Product', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-002', startDate: '2024-03-01', endDate: '', location: 'Remote', costCenter: 'PRD', jobFamily: 'Product' },
          { id: 'POS-003', managerId: 'POS-001', secondaryManagerId: '', title: 'Head of Engineering', type: 'Head', group: 'Engineering', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-003', startDate: '2024-02-12', endDate: '', location: 'Berlin', costCenter: 'ENG', jobFamily: 'Engineering' },
          { id: 'POS-004', managerId: 'POS-002', secondaryManagerId: 'POS-003', title: 'Product Manager', type: 'Specialist', group: 'Product', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-004', startDate: '2025-01-06', endDate: '', location: 'Remote', costCenter: 'PRD', jobFamily: 'Product' },
          { id: 'POS-005', managerId: 'POS-003', secondaryManagerId: '', title: 'Senior Engineer', type: 'Engineer', group: 'Engineering', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-005', startDate: '2024-06-01', endDate: '', location: 'Berlin', costCenter: 'ENG', jobFamily: 'Engineering' },
          { id: 'POS-006', managerId: 'POS-003', secondaryManagerId: '', title: 'Software Engineer', type: 'Engineer', group: 'Engineering', fte: 1, status: 'Approved', hiringState: 'Recruiting', personId: '', startDate: '2026-11-01', endDate: '', location: 'Berlin', costCenter: 'ENG', jobFamily: 'Engineering' },
          { id: 'POS-007', managerId: 'POS-003', secondaryManagerId: '', title: 'Graduate Engineer', type: 'Graduate', group: 'Engineering', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-006', startDate: '2026-09-01', endDate: '', location: 'Berlin', costCenter: 'ENG', jobFamily: 'Engineering' },
          { id: 'POS-008', managerId: 'POS-002', secondaryManagerId: '', title: 'Design intern', type: 'Intern', group: 'Product', fte: 0.8, status: 'Not approved', hiringState: 'Filled', personId: 'EMP-007', startDate: '2026-07-01', endDate: '2026-12-31', location: 'Remote', costCenter: 'PRD', jobFamily: 'Design' }
        ]
      }]
    }
  },
  'lumen-studio': {
    label: 'Agency · 9 people',
    blurb: 'A boutique studio with a dotted line from production into creative.',
    palette: 'graphite',
    branding: { companyName: 'Lumen Studio', chartTitle: 'Studio roster', logo: null, darkLogo: null, includeExports: true, footer: 'For client teams' },
    planning: {
      version: 2, activeScenarioId: 'current',
      scenarios: [{
        id: 'current', name: 'Current', description: '', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', baseScenarioId: '', baseSnapshot: null,
        employees: [
          { id: 'EMP-001', name: 'Marta Klein', employeeNumber: 'LS-12', photo: null },
          { id: 'EMP-002', name: 'Theo Barnes', employeeNumber: 'LS-18', photo: null },
          { id: 'EMP-003', name: 'Priya Sethi', employeeNumber: 'LS-21', photo: null },
          { id: 'EMP-004', name: 'Hugo Almeida', employeeNumber: 'LS-24', photo: null },
          { id: 'EMP-005', name: 'Jin Park', employeeNumber: 'LS-27', photo: null },
          { id: 'EMP-006', name: 'Rosa DiMarco', employeeNumber: 'LS-31', photo: null },
          { id: 'EMP-007', name: 'Leah Okonkwo', employeeNumber: 'LS-33', photo: null },
          { id: 'EMP-008', name: 'Samir Haddad', employeeNumber: 'LS-40', photo: null }
        ],
        positions: [
          { id: 'POS-001', managerId: '', secondaryManagerId: '', title: 'Managing Director', type: 'Head', group: 'Leadership', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-001', startDate: '2019-04-01', endDate: '', location: 'Lisbon', costCenter: 'STU', jobFamily: 'Leadership' },
          { id: 'POS-002', managerId: 'POS-001', secondaryManagerId: '', title: 'Creative Director', type: 'Head', group: 'Creative', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-002', startDate: '2020-01-15', endDate: '', location: 'Lisbon', costCenter: 'CRE', jobFamily: 'Design' },
          { id: 'POS-003', managerId: 'POS-001', secondaryManagerId: '', title: 'Head of Client Services', type: 'Head', group: 'Accounts', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-003', startDate: '2021-06-01', endDate: '', location: 'Lisbon', costCenter: 'ACC', jobFamily: 'Delivery' },
          { id: 'POS-004', managerId: 'POS-002', secondaryManagerId: '', title: 'Art Director', type: 'Team Leader', group: 'Creative', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-004', startDate: '2022-03-01', endDate: '', location: 'Lisbon', costCenter: 'CRE', jobFamily: 'Design' },
          { id: 'POS-005', managerId: 'POS-004', secondaryManagerId: '', title: 'Designer', type: 'Specialist', group: 'Creative', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-005', startDate: '2023-09-01', endDate: '', location: 'Porto', costCenter: 'CRE', jobFamily: 'Design' },
          { id: 'POS-006', managerId: 'POS-004', secondaryManagerId: '', title: 'Motion designer', type: 'Specialist', group: 'Creative', fte: 0.6, status: 'Approved', hiringState: 'Filled', personId: 'EMP-006', startDate: '2025-02-01', endDate: '', location: 'Remote', costCenter: 'CRE', jobFamily: 'Design' },
          { id: 'POS-007', managerId: 'POS-003', secondaryManagerId: 'POS-002', title: 'Producer', type: 'Specialist', group: 'Accounts', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-007', startDate: '2024-01-08', endDate: '', location: 'Lisbon', costCenter: 'ACC', jobFamily: 'Delivery' },
          { id: 'POS-008', managerId: 'POS-003', secondaryManagerId: '', title: 'Account manager', type: 'Specialist', group: 'Accounts', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-008', startDate: '2024-08-01', endDate: '', location: 'Lisbon', costCenter: 'ACC', jobFamily: 'Delivery' },
          { id: 'POS-009', managerId: 'POS-004', secondaryManagerId: '', title: 'Design intern', type: 'Intern', group: 'Creative', fte: 1, status: 'Not approved', hiringState: 'Vacant', personId: '', startDate: '2027-01-12', endDate: '2027-06-30', location: 'Lisbon', costCenter: 'CRE', jobFamily: 'Design' }
        ]
      }]
    }
  },
  'cedar-kind': {
    label: 'Nonprofit · 7 people',
    blurb: 'A small charity with programmes and fundraising.',
    palette: 'emerald',
    branding: { companyName: 'Cedar & Kind', chartTitle: 'Staff structure', logo: null, darkLogo: null, includeExports: true, footer: 'Internal planning' },
    planning: {
      version: 2, activeScenarioId: 'current',
      scenarios: [{
        id: 'current', name: 'Current', description: '', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z', baseScenarioId: '', baseSnapshot: null,
        employees: [
          { id: 'EMP-001', name: 'Helen Okeke', employeeNumber: 'CK-01', photo: null },
          { id: 'EMP-002', name: 'Marcus Bell', employeeNumber: 'CK-04', photo: null },
          { id: 'EMP-003', name: 'Yara Nassar', employeeNumber: 'CK-07', photo: null },
          { id: 'EMP-004', name: 'Ivy Chen', employeeNumber: 'CK-11', photo: null },
          { id: 'EMP-005', name: 'Tomás Rivera', employeeNumber: 'CK-14', photo: null },
          { id: 'EMP-006', name: 'Nora Blake', employeeNumber: 'CK-18', photo: null }
        ],
        positions: [
          { id: 'POS-001', managerId: '', secondaryManagerId: '', title: 'Executive Director', type: 'Head', group: 'Leadership', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-001', startDate: '2018-09-03', endDate: '', location: 'Manchester', costCenter: 'DIR', jobFamily: 'Leadership' },
          { id: 'POS-002', managerId: 'POS-001', secondaryManagerId: '', title: 'Head of Programmes', type: 'Head', group: 'Programmes', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-002', startDate: '2020-04-01', endDate: '', location: 'Manchester', costCenter: 'PRG', jobFamily: 'Delivery' },
          { id: 'POS-003', managerId: 'POS-001', secondaryManagerId: '', title: 'Head of Development', type: 'Head', group: 'Fundraising', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-003', startDate: '2021-02-01', endDate: '', location: 'London', costCenter: 'DEV', jobFamily: 'Fundraising' },
          { id: 'POS-004', managerId: 'POS-002', secondaryManagerId: '', title: 'Programme coordinator', type: 'Specialist', group: 'Programmes', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-004', startDate: '2023-05-02', endDate: '', location: 'Manchester', costCenter: 'PRG', jobFamily: 'Delivery' },
          { id: 'POS-005', managerId: 'POS-002', secondaryManagerId: '', title: 'Programme officer', type: 'Specialist', group: 'Programmes', fte: 0.8, status: 'Approved', hiringState: 'Filled', personId: 'EMP-005', startDate: '2024-09-01', endDate: '', location: 'Leeds', costCenter: 'PRG', jobFamily: 'Delivery' },
          { id: 'POS-006', managerId: 'POS-003', secondaryManagerId: 'POS-001', title: 'Partnerships manager', type: 'Specialist', group: 'Fundraising', fte: 1, status: 'Approved', hiringState: 'Filled', personId: 'EMP-006', startDate: '2025-01-13', endDate: '', location: 'London', costCenter: 'DEV', jobFamily: 'Fundraising' },
          { id: 'POS-007', managerId: 'POS-003', secondaryManagerId: '', title: 'Grants officer', type: 'Graduate', group: 'Fundraising', fte: 1, status: 'Not approved', hiringState: 'Recruiting', personId: '', startDate: '2027-01-05', endDate: '', location: 'London', costCenter: 'DEV', jobFamily: 'Fundraising' }
        ]
      }]
    }
  }
};
})(typeof globalThis !== 'undefined' ? globalThis : this);
